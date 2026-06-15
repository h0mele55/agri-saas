import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { createDataStream, listDataStreams } from '@/app-layer/usecases/data-stream';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * Data streams (Agro-intel) — sensor / external time-series definitions.
 * Part of the ag product; tenant-scoped + authenticated. The live
 * ingestion endpoint is separately feature-flagged + public.
 *
 *   GET  → list the tenant's data streams (no token hashes exposed).
 *   POST → create a stream + MINT a raw ingest token (returned ONCE).
 */

const CreateDataStreamSchema = z
    .object({
        key: z.string().min(1).max(120),
        name: z.string().min(1).max(200),
        kind: z.enum([
            'TEMPERATURE',
            'SOIL_MOISTURE',
            'HUMIDITY',
            'RAINFALL',
            'WIND',
            'LEAF_WETNESS',
            'CUSTOM',
        ]),
        unit: z.string().max(32).nullable().optional(),
        locationId: z.string().nullable().optional(),
    })
    .strip();

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const streams = await listDataStreams(ctx);
        return jsonResponse(streams);
    },
);

export const POST = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const body = CreateDataStreamSchema.parse(await req.json());
        const created = await createDataStream(ctx, body);
        return jsonResponse(created, { status: 201 });
    },
);
