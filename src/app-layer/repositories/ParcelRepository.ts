import { Prisma } from '@prisma/client';
import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { geometrySql, areaHectaresSql, asGeoJsonSql, col, parseGeometry } from '@/lib/db/geo';
import type { ParsedParcel } from '@/lib/spatial/parse';
import type { Geometry } from 'geojson';

/** A parcel returned to the client — geometry serialized to GeoJSON. */
export interface ParcelGeo {
    id: string;
    name: string;
    cropType: string | null;
    areaHa: number | null;
    geometry: Geometry | null;
    properties: unknown;
}

/**
 * Parcel repository — the ONLY consumer of the geo helpers. All
 * geometry I/O is raw SQL (the `geometry` column is a Prisma
 * `Unsupported(...)`), built exclusively from `src/lib/db/geo.ts`
 * fragments and run via `$executeRaw` / `$queryRaw` inside a tenant
 * transaction (RLS-scoped). No `ST_*` text appears here — only the
 * typed fragments — so the geo-raw-sql-containment guardrail holds.
 */
export class ParcelRepository {
    /**
     * Replace all parcels for a Location with the freshly-parsed set.
     * Hard-deletes the existing parcels (re-import semantics) then
     * inserts each one, writing geometry via ST_GeomFromGeoJSON and
     * areaHa via ST_Area (geography cast → hectares). Returns the count.
     */
    static async replaceForLocation(
        db: PrismaTx,
        ctx: RequestContext,
        locationId: string,
        parcels: ParsedParcel[],
    ): Promise<number> {
        await db.parcel.deleteMany({ where: { locationId, tenantId: ctx.tenantId } });

        for (const p of parcels) {
            // Create the row through Prisma so id/defaults are minted,
            // omitting the Unsupported geometry column…
            const row = await db.parcel.create({
                data: {
                    tenantId: ctx.tenantId,
                    locationId,
                    name: p.name,
                    propertiesJson: (p.properties ?? {}) as Prisma.InputJsonValue,
                },
                select: { id: true },
            });
            // …then stamp geometry + denormalized areaHa via the geo
            // fragments. areaHa is computed from the same geometry
            // expression so it lands in one statement.
            await db.$executeRaw(
                Prisma.sql`UPDATE "Parcel"
                    SET "geometry" = ${geometrySql(p.geometry)},
                        "areaHa" = ${areaHectaresSql(geometrySql(p.geometry))}
                    WHERE "id" = ${row.id} AND "tenantId" = ${ctx.tenantId}`,
            );
        }

        return parcels.length;
    }

    /** List a location's parcels with geometry serialized to GeoJSON. */
    static async listForLocation(db: PrismaTx, ctx: RequestContext, locationId: string): Promise<ParcelGeo[]> {
        const rows = await db.$queryRaw<Array<{
            id: string;
            name: string;
            cropType: string | null;
            areaHa: string | null;
            geojson: string | null;
            propertiesJson: unknown;
        }>>(
            Prisma.sql`SELECT "id", "name", "cropType", "areaHa"::text AS "areaHa",
                    ${asGeoJsonSql(col('geometry'))} AS "geojson", "propertiesJson"
                FROM "Parcel"
                WHERE "locationId" = ${locationId}
                  AND "tenantId" = ${ctx.tenantId}
                  AND "deletedAt" IS NULL
                ORDER BY "name" ASC`,
        );

        return rows.map((r) => ({
            id: r.id,
            name: r.name,
            cropType: r.cropType,
            areaHa: r.areaHa !== null ? Number(r.areaHa) : null,
            geometry: parseGeometry(r.geojson),
            properties: r.propertiesJson ?? null,
        }));
    }

    /** Count a location's (non-deleted) parcels. */
    static async countForLocation(db: PrismaTx, ctx: RequestContext, locationId: string): Promise<number> {
        return db.parcel.count({ where: { locationId, tenantId: ctx.tenantId, deletedAt: null } });
    }

    /**
     * Of the supplied ids, return those that are real, non-deleted
     * parcels of this location (used to validate a field-operation's
     * parcel selection). Tenant-scoped.
     */
    static async validIdsForLocation(
        db: PrismaTx,
        ctx: RequestContext,
        locationId: string,
        ids: string[],
    ): Promise<Set<string>> {
        if (ids.length === 0) return new Set();
        const rows = await db.parcel.findMany({
            where: { id: { in: ids }, locationId, tenantId: ctx.tenantId, deletedAt: null },
            select: { id: true },
        });
        return new Set(rows.map((r) => r.id));
    }
}
