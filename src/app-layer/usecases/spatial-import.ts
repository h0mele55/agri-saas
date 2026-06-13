import { Prisma } from '@prisma/client';
import { RequestContext } from '../types';
import { assertCanWrite } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound } from '@/lib/errors/types';
import { runInTenantContext } from '@/lib/db-context';
import { parseSpatialFile } from '@/lib/spatial/parse';
import { getStorageProvider, buildTenantObjectKey } from '@/lib/storage';
import { FileRepository } from '../repositories/FileRepository';
import { ParcelRepository } from '../repositories/ParcelRepository';
import { env } from '@/env';
import { Readable } from 'node:stream';

export interface SpatialImportInput {
    filename: string;
    buffer: Buffer;
    mimeType?: string;
}

export interface SpatialImportResult {
    locationId: string;
    fileRecordId: string;
    format: string;
    parcelCount: number;
    bounds: [number, number, number, number] | null;
    skipped: number;
}

/**
 * Import a spatial file into a Location:
 *   1. parse it (pure — shpjs/togeojson, normalized to WGS84 GeoJSON),
 *   2. store the original upload via the existing FileRecord pipeline
 *      (domain "spatial"; ClamAV scans asynchronously via the webhook —
 *      markStored leaves scanStatus = PENDING),
 *   3. replace the location's parcels, writing geometry + areaHa through
 *      the geo helpers (ST_GeomFromGeoJSON / ST_Area),
 *   4. stamp the spatial file + format + bounding box on the Location.
 *
 * Steps 2–4 run inside one tenant transaction; the byte-write to object
 * storage happens first (outside the txn, like the evidence-import path).
 */
export async function importLocationSpatialFile(
    ctx: RequestContext,
    locationId: string,
    file: SpatialImportInput,
): Promise<SpatialImportResult> {
    assertCanWrite(ctx);

    // 1 — parse (throws SpatialParseError on unsupported / empty)
    const parsed = await parseSpatialFile({
        filename: file.filename,
        buffer: file.buffer,
        mimeType: file.mimeType,
    });

    // 2 — persist the original upload's bytes through the storage abstraction
    const storage = getStorageProvider();
    const mimeType = file.mimeType || 'application/octet-stream';
    const pathKey = buildTenantObjectKey(ctx.tenantId, 'spatial', file.filename);
    const writeResult = await storage.write(pathKey, Readable.from(file.buffer), { mimeType });

    // 3 + 4 — FileRecord + parcels + Location stamp, atomically
    return runInTenantContext(ctx, async (db) => {
        const location = await db.location.findFirst({
            where: { id: locationId, tenantId: ctx.tenantId, deletedAt: null },
            select: { id: true, name: true },
        });
        if (!location) throw notFound('Location not found');

        const fileRecord = await FileRepository.createPending(db, ctx, {
            pathKey,
            originalName: file.filename,
            mimeType,
            sizeBytes: writeResult.sizeBytes,
            sha256: writeResult.sha256,
            storageProvider: storage.name,
            bucket: env.S3_BUCKET || null,
            domain: 'spatial',
        });
        await FileRepository.markStored(db, ctx, fileRecord.id);

        const parcelCount = await ParcelRepository.replaceForLocation(db, ctx, locationId, parsed.parcels);

        await db.location.update({
            where: { id: locationId },
            data: {
                spatialFileId: fileRecord.id,
                spatialFormat: parsed.format,
                boundsJson: parsed.bounds
                    ? (parsed.bounds as unknown as Prisma.InputJsonValue)
                    : Prisma.JsonNull,
            },
        });

        await logEvent(db, ctx, {
            action: 'LOCATION_SPATIAL_IMPORTED',
            entityType: 'Location',
            entityId: locationId,
            details: `Imported ${parcelCount} parcels from ${file.filename}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Location',
                operation: 'updated',
                after: { spatialFormat: parsed.format, parcelCount },
                summary: `Imported ${parcelCount} parcels from ${file.filename}`,
            },
        });

        return {
            locationId,
            fileRecordId: fileRecord.id,
            format: parsed.format,
            parcelCount,
            bounds: parsed.bounds,
            skipped: parsed.skipped,
        };
    });
}
