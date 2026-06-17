/**
 * `npm run validate:geometries` — operator maintenance: scan every
 * parcel's stored geometry, flag the topologically-invalid ones and the
 * ones missing a denormalized `areaHa`, and (with `--apply`) REPAIR them
 * in place.
 *
 * Why this exists. `Parcel.geometry` is a PostGIS `geometry(MultiPolygon,
 * 4326)` column. Modern writes go through `repairedGeometrySql` /
 * `areaHectaresNonNullSql` (see ParcelRepository), so newly-imported
 * parcels are always valid with a non-NULL area. But historical rows —
 * imported before the repair-on-write path landed, or hand-loaded — can
 * carry self-intersecting geometry (a meaningless `ST_Area`) or a NULL
 * `areaHa`. This script is the one-shot + re-runnable cleanup:
 *   - invalid geometry      → `ST_MakeValid` repair + recomputed areaHa
 *   - valid but areaHa NULL → recompute areaHa from the existing geometry
 *
 * CROSS-TENANT by design. This is an operator script, not a request
 * path: it uses the raw Prisma client with NO RLS/tenant context, so it
 * sweeps every tenant's parcels in one pass. Never wire this into an
 * HTTP handler.
 *
 *   npm run validate:geometries                  # dry-run (report only)
 *   npm run validate:geometries -- --apply       # repair
 *   npx tsx scripts/validate-parcel-geometries.ts --apply
 *
 * Output: a human-readable report plus a single machine-parseable JSON
 * summary line:
 *   { ok, mode, scanned, invalid, areaHaNull, repaired, areaHaBackfilled }
 *
 * Idempotent: after `--apply`, a subsequent dry-run reports
 * `invalid: 0, areaHaNull: 0` (every geometry is valid + every parcel
 * with geometry has an areaHa).
 *
 * Exit codes: 0 = ok, 1 = fatal runtime error (DB unreachable, etc.).
 *
 * All PostGIS lives behind the `@/lib/db/geo` helpers — no `ST_*` text
 * appears here, so the geo-raw-sql-containment guardrail holds.
 */
process.env.SKIP_ENV_VALIDATION = '1';

import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
    col,
    isValidGeometryColumnSql,
    repairedGeometryColumnSql,
    areaHectaresNonNullSql,
} from '@/lib/db/geo';

/** Process a bounded batch of parcel ids per UPDATE (keeps `id IN (...)` sane). */
const BATCH_SIZE = 500;

/** Number of offending ids to surface in the dry-run report. */
const SAMPLE_SIZE = 20;

/** The machine-parseable summary returned by `validateParcelGeometries`. */
export interface GeometryValidationSummary {
    ok: boolean;
    mode: 'dry-run' | 'apply';
    /** Parcels with a non-NULL geometry that were scanned. */
    scanned: number;
    /** Of those, how many have a topologically-INVALID geometry. */
    invalid: number;
    /** Of those, how many have `areaHa IS NULL`. */
    areaHaNull: number;
    /** Geometries repaired (0 in dry-run). */
    repaired: number;
    /** areaHa values (re)computed for valid-but-NULL rows (0 in dry-run). */
    areaHaBackfilled: number;
    /** A small sample of offending parcel ids (for the dry-run report). */
    sampleInvalidIds: string[];
    sampleAreaHaNullIds: string[];
}

/** Minimal Prisma surface this script needs — eases test injection. */
type RawClient = Pick<PrismaClient, '$queryRaw' | '$executeRaw'>;

/** Split an array into fixed-size chunks. */
function chunk<T>(items: readonly T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}

/**
 * Scan all parcels with geometry; report (and, when `apply`, repair)
 * invalid geometries and NULL `areaHa`. Exported for tests.
 *
 * The scan is ONE query that classifies every parcel-with-geometry via
 * the geo helpers (`ST_IsValid` + an `areaHa IS NULL` check), so there is
 * no per-row round-trip on the read path. Repairs are batched by id —
 * `id IN (...)` in `BATCH_SIZE` chunks — and WHERE-scoped to exactly the
 * offending rows, so the write path is bounded too.
 */
export async function validateParcelGeometries(
    prisma: RawClient,
    opts: { apply: boolean },
): Promise<GeometryValidationSummary> {
    const apply = opts.apply;

    // ── Scan: classify every parcel that has a geometry in one pass. ──
    // `valid` = geometry is topologically valid; `areaHaNull` = the
    // denormalized area column is NULL. The two are independent flags.
    const rows = await prisma.$queryRaw<
        Array<{ id: string; valid: boolean; areaHaNull: boolean }>
    >(
        Prisma.sql`
            SELECT
                "id",
                ${isValidGeometryColumnSql(col('geometry'))} AS "valid",
                ("areaHa" IS NULL) AS "areaHaNull"
            FROM "Parcel"
            WHERE "geometry" IS NOT NULL
            ORDER BY "id" ASC`,
    );

    const scanned = rows.length;
    const invalidIds = rows.filter((r) => r.valid !== true).map((r) => r.id);
    // areaHa backfill (the cheap path) only targets rows whose geometry is
    // ALREADY valid — invalid rows get a fresh areaHa as part of their
    // repair below, so counting them here too would double-handle them.
    const areaHaNullValidIds = rows
        .filter((r) => r.valid === true && r.areaHaNull === true)
        .map((r) => r.id);

    const invalid = invalidIds.length;
    // Report the TOTAL areaHa-NULL count (valid + invalid) so the operator
    // sees the true backlog; the repair below covers both populations.
    const areaHaNull = rows.filter((r) => r.areaHaNull === true).length;

    const summary: GeometryValidationSummary = {
        ok: true,
        mode: apply ? 'apply' : 'dry-run',
        scanned,
        invalid,
        areaHaNull,
        repaired: 0,
        areaHaBackfilled: 0,
        sampleInvalidIds: invalidIds.slice(0, SAMPLE_SIZE),
        sampleAreaHaNullIds: rows
            .filter((r) => r.areaHaNull === true)
            .map((r) => r.id)
            .slice(0, SAMPLE_SIZE),
    };

    if (!apply) {
        return summary;
    }

    // ── Repair (--apply only). ───────────────────────────────────────

    // 1. Invalid geometries: ST_MakeValid the column in place, and
    //    recompute areaHa FROM the repaired geometry (one statement, so
    //    areaHa can never lag the geometry). Scoped to exactly the
    //    invalid ids, batched.
    let repaired = 0;
    for (const ids of chunk(invalidIds, BATCH_SIZE)) {
        const repairedGeom = repairedGeometryColumnSql(col('geometry'));
        const affected = await prisma.$executeRaw(
            Prisma.sql`
                UPDATE "Parcel"
                SET "geometry" = ${repairedGeom},
                    "areaHa" = ${areaHectaresNonNullSql(repairedGeometryColumnSql(col('geometry')))}
                WHERE "id" IN (${Prisma.join(ids)})`,
        );
        repaired += Number(affected);
    }

    // 2. Valid-but-areaHa-NULL: recompute areaHa from the (already valid)
    //    stored geometry. No geometry change.
    let areaHaBackfilled = 0;
    for (const ids of chunk(areaHaNullValidIds, BATCH_SIZE)) {
        const affected = await prisma.$executeRaw(
            Prisma.sql`
                UPDATE "Parcel"
                SET "areaHa" = ${areaHectaresNonNullSql(col('geometry'))}
                WHERE "id" IN (${Prisma.join(ids)})`,
        );
        areaHaBackfilled += Number(affected);
    }

    summary.repaired = repaired;
    summary.areaHaBackfilled = areaHaBackfilled;
    return summary;
}

async function main(): Promise<number> {
    const argv = process.argv.slice(2);
    // Default to dry-run; --apply opts into writes. --dry-run is accepted
    // explicitly too (and wins is moot — apply must be present to write).
    const apply = argv.includes('--apply');

    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
    const prisma = new PrismaClient({ adapter });
    try {
        const summary = await validateParcelGeometries(prisma, { apply });

        // Human-readable report first…
        process.stdout.write(
            `Parcel geometry validation (${summary.mode})\n` +
            `  scanned:          ${summary.scanned}\n` +
            `  invalid geometry: ${summary.invalid}\n` +
            `  areaHa NULL:      ${summary.areaHaNull}\n`,
        );
        if (!apply) {
            if (summary.sampleInvalidIds.length > 0) {
                process.stdout.write(
                    `  sample invalid ids:    ${summary.sampleInvalidIds.join(', ')}\n`,
                );
            }
            if (summary.sampleAreaHaNullIds.length > 0) {
                process.stdout.write(
                    `  sample areaHa-null ids: ${summary.sampleAreaHaNullIds.join(', ')}\n`,
                );
            }
            if (summary.invalid > 0 || summary.areaHaNull > 0) {
                process.stdout.write('  → re-run with --apply to repair.\n');
            }
        } else {
            process.stdout.write(
                `  repaired:         ${summary.repaired}\n` +
                `  areaHa backfilled: ${summary.areaHaBackfilled}\n`,
            );
        }

        // …then the single machine-parseable JSON summary line.
        process.stdout.write(
            `${JSON.stringify({
                ok: summary.ok,
                mode: summary.mode,
                scanned: summary.scanned,
                invalid: summary.invalid,
                areaHaNull: summary.areaHaNull,
                repaired: summary.repaired,
                areaHaBackfilled: summary.areaHaBackfilled,
            })}\n`,
        );
        return 0;
    } catch (err) {
        process.stderr.write(
            `validate:geometries failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        return 1;
    } finally {
        await prisma.$disconnect();
    }
}

// Only run when invoked directly (not when imported by a test).
if (require.main === module) {
    main().then(
        (code) => process.exit(code),
        (err) => {
            process.stderr.write(`${String(err)}\n`);
            process.exit(1);
        },
    );
}
