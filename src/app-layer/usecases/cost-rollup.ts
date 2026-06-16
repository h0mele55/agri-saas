import { Prisma } from '@prisma/client';
import { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { assertCanRead } from '../policies/common';
import type { PrismaTx } from '@/lib/db-context';

/**
 * Per-activity cost rollup (ENTERPRISE-grain, GRAIN module).
 *
 * Rolls up two cost sources, grouped by planting / field (location) /
 * season:
 *   1. `LogEntry.costAmount` — the field-event cost (Ekylibre intervention
 *      cost concept), for the LogEntries linked to a planting via
 *      `LogPlanting`.
 *   2. `StockTransaction.costAmount` — the per-movement cost of the stock
 *      transactions linked to those same LogEntries (via
 *      `StockTransaction.logEntryId`).
 *
 * N+1 avoidance: every level is resolved in BOUNDED batched queries —
 * gather plantings, gather their LogPlanting→logEntryIds in one query,
 * then ONE `logEntry.findMany({ where: { id: { in } } })` and ONE
 * `stockTransaction.findMany({ where: { logEntryId: { in } } })`. The
 * per-planting / per-field / per-season reduction happens in memory.
 *
 * Currency: a single tenant currency is assumed. When costCurrency varies,
 * the FIRST non-null currency seen is passed through (pragmatic — the
 * magnitudes still sum; a multi-currency tenant should normalise upstream).
 */

const LIST_TAKE = 500;
// Bound for the batched id-set queries below — plantings × their log
// entries can fan out, so cap the intermediate reads too.
const BATCH_TAKE = 5000;

function dec(v: Prisma.Decimal | null | undefined): number {
    if (v == null) return 0;
    return typeof v === 'number' ? v : Number(v.toString());
}

export interface PlantingCostRow {
    plantingId: string;
    plantingName: string;
    cropVariety: string | null;
    seasonId: string | null;
    locationId: string | null;
    logEntryCost: number;
    stockCost: number;
    totalCost: number;
    currency: string | null;
}

export interface SeasonCostRow {
    seasonId: string | null;
    seasonName: string | null;
    logEntryCost: number;
    stockCost: number;
    totalCost: number;
    currency: string | null;
    plantingCount: number;
}

export interface FieldCostRow {
    locationId: string | null;
    locationName: string | null;
    logEntryCost: number;
    stockCost: number;
    totalCost: number;
    currency: string | null;
    plantingCount: number;
}

/** Pick the first non-null currency, preferring an existing value. */
function pickCurrency(current: string | null, next: string | null): string | null {
    return current ?? next ?? null;
}

/**
 * Resolve the per-planting cost rows. Runs entirely inside `db` (the
 * caller's RLS-bound tenant transaction). The heavy lifting all three
 * public rollups share.
 */
async function computePlantingCostRows(
    db: PrismaTx,
    ctx: RequestContext,
    filters: { seasonId?: string } = {},
    take = LIST_TAKE,
): Promise<PlantingCostRow[]> {
    const plantings = await db.planting.findMany({
        where: {
            tenantId: ctx.tenantId,
            deletedAt: null,
            ...(filters.seasonId ? { cropPlan: { is: { seasonId: filters.seasonId } } } : {}),
        },
        orderBy: [{ createdAt: 'desc' }],
        select: {
            id: true,
            successionNumber: true,
            locationId: true,
            variety: { select: { name: true } },
            cropPlan: { select: { seasonId: true, name: true } },
        },
        take,
    });
    if (plantings.length === 0) return [];

    const plantingIds = plantings.map((p) => p.id);

    // ── ONE query: every LogPlanting link for these plantings ──
    const logLinks = await db.logPlanting.findMany({
        where: { tenantId: ctx.tenantId, plantingId: { in: plantingIds } },
        select: { plantingId: true, logEntryId: true },
        take: BATCH_TAKE,
    });
    // logEntryId → plantingId (a log entry realises one planting stage).
    const logEntryToPlanting = new Map<string, string>();
    for (const link of logLinks) logEntryToPlanting.set(link.logEntryId, link.plantingId);
    const logEntryIds = [...logEntryToPlanting.keys()];

    // ── ONE query: the LogEntry cost for those entries ──
    const logEntries = logEntryIds.length
        ? await db.logEntry.findMany({
              where: { tenantId: ctx.tenantId, id: { in: logEntryIds }, deletedAt: null },
              select: { id: true, costAmount: true, costCurrency: true },
              take: BATCH_TAKE,
          })
        : [];

    // ── ONE query: the StockTransaction cost linked to those entries ──
    const stockTx = logEntryIds.length
        ? await db.stockTransaction.findMany({
              where: { tenantId: ctx.tenantId, logEntryId: { in: logEntryIds } },
              select: { logEntryId: true, costAmount: true, costCurrency: true },
              take: BATCH_TAKE,
          })
        : [];

    // Accumulate per planting.
    const acc = new Map<string, { logCost: number; stockCost: number; currency: string | null }>();
    const ensure = (pid: string) => {
        let row = acc.get(pid);
        if (!row) {
            row = { logCost: 0, stockCost: 0, currency: null };
            acc.set(pid, row);
        }
        return row;
    };
    for (const entry of logEntries) {
        const pid = logEntryToPlanting.get(entry.id);
        if (!pid) continue;
        const row = ensure(pid);
        row.logCost += dec(entry.costAmount);
        row.currency = pickCurrency(row.currency, entry.costCurrency);
    }
    for (const tx of stockTx) {
        const pid = tx.logEntryId ? logEntryToPlanting.get(tx.logEntryId) : undefined;
        if (!pid) continue;
        const row = ensure(pid);
        row.stockCost += dec(tx.costAmount);
        row.currency = pickCurrency(row.currency, tx.costCurrency);
    }

    return plantings.map((p): PlantingCostRow => {
        const row = acc.get(p.id) ?? { logCost: 0, stockCost: 0, currency: null };
        const logEntryCost = Math.round(row.logCost * 100) / 100;
        const stockCost = Math.round(row.stockCost * 100) / 100;
        return {
            plantingId: p.id,
            plantingName: `${p.cropPlan?.name ?? 'Planting'} #${p.successionNumber}`,
            cropVariety: p.variety?.name ?? null,
            seasonId: p.cropPlan?.seasonId ?? null,
            locationId: p.locationId,
            logEntryCost,
            stockCost,
            totalCost: Math.round((logEntryCost + stockCost) * 100) / 100,
            currency: row.currency,
        };
    });
}

export async function getCostRollupByPlanting(
    ctx: RequestContext,
    opts: { seasonId?: string; take?: number } = {},
): Promise<PlantingCostRow[]> {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        computePlantingCostRows(db, ctx, { seasonId: opts.seasonId }, opts.take ?? LIST_TAKE),
    );
}

export async function getCostRollupBySeason(
    ctx: RequestContext,
    opts: { take?: number } = {},
): Promise<SeasonCostRow[]> {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const rows = await computePlantingCostRows(db, ctx, {}, opts.take ?? LIST_TAKE);

        const bySeason = new Map<string, SeasonCostRow>();
        for (const r of rows) {
            const key = r.seasonId ?? '__none__';
            let agg = bySeason.get(key);
            if (!agg) {
                agg = {
                    seasonId: r.seasonId,
                    seasonName: null,
                    logEntryCost: 0,
                    stockCost: 0,
                    totalCost: 0,
                    currency: null,
                    plantingCount: 0,
                };
                bySeason.set(key, agg);
            }
            agg.logEntryCost = Math.round((agg.logEntryCost + r.logEntryCost) * 100) / 100;
            agg.stockCost = Math.round((agg.stockCost + r.stockCost) * 100) / 100;
            agg.totalCost = Math.round((agg.totalCost + r.totalCost) * 100) / 100;
            agg.currency = pickCurrency(agg.currency, r.currency);
            agg.plantingCount += 1;
        }

        // Resolve season names in ONE query (no N+1).
        const seasonIds = [...bySeason.values()].map((s) => s.seasonId).filter((id): id is string => !!id);
        if (seasonIds.length) {
            const seasons = await db.season.findMany({
                where: { tenantId: ctx.tenantId, id: { in: seasonIds } },
                select: { id: true, name: true },
                take: LIST_TAKE,
            });
            const names = new Map(seasons.map((s) => [s.id, s.name]));
            for (const agg of bySeason.values()) {
                if (agg.seasonId) agg.seasonName = names.get(agg.seasonId) ?? null;
            }
        }
        return [...bySeason.values()];
    });
}

export async function getCostRollupByField(
    ctx: RequestContext,
    opts: { take?: number } = {},
): Promise<FieldCostRow[]> {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const rows = await computePlantingCostRows(db, ctx, {}, opts.take ?? LIST_TAKE);

        const byField = new Map<string, FieldCostRow>();
        for (const r of rows) {
            const key = r.locationId ?? '__none__';
            let agg = byField.get(key);
            if (!agg) {
                agg = {
                    locationId: r.locationId,
                    locationName: null,
                    logEntryCost: 0,
                    stockCost: 0,
                    totalCost: 0,
                    currency: null,
                    plantingCount: 0,
                };
                byField.set(key, agg);
            }
            agg.logEntryCost = Math.round((agg.logEntryCost + r.logEntryCost) * 100) / 100;
            agg.stockCost = Math.round((agg.stockCost + r.stockCost) * 100) / 100;
            agg.totalCost = Math.round((agg.totalCost + r.totalCost) * 100) / 100;
            agg.currency = pickCurrency(agg.currency, r.currency);
            agg.plantingCount += 1;
        }

        // Resolve field (location) names in ONE query.
        const locationIds = [...byField.values()].map((f) => f.locationId).filter((id): id is string => !!id);
        if (locationIds.length) {
            const locations = await db.location.findMany({
                where: { tenantId: ctx.tenantId, id: { in: locationIds } },
                select: { id: true, name: true },
                take: LIST_TAKE,
            });
            const names = new Map(locations.map((l) => [l.id, l.name]));
            for (const agg of byField.values()) {
                if (agg.locationId) agg.locationName = names.get(agg.locationId) ?? null;
            }
        }
        return [...byField.values()];
    });
}
