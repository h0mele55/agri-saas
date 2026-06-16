import { Prisma, LocationKind } from '@prisma/client';
import { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { assertCanRead, assertCanWrite } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound, badRequest } from '@/lib/errors/types';
import { sanitizePlainText } from '@/lib/security/sanitize';
import type { CreateBinInput, UpdateBinInput } from '../schemas/grain.schemas';

/**
 * Grain bins — physical grain storage. A bin is a `Location` row whose
 * `kind` is BIN or STORAGE (a FIELD is a growing area, never a bin) and
 * which carries a `capacityTonnes`. `InventoryLot.locationId` ties stored
 * grain lots to the bin.
 *
 * Shape mirrors `crop-planning.ts` / the other grain usecases:
 *   - authorize via assertCanRead/Write BEFORE data access,
 *   - sanitize user free text (name / description / key → sanitizePlainText),
 *   - emit a hash-chained audit event on EVERY mutation (entityType
 *     'Location', the grain-bin role recorded in the summary),
 *   - all DB access through runInTenantContext (RLS-bound) + bounded `take:`.
 *
 * Fill computation avoids N+1: list the bins, then ONE
 * `inventoryLot.findMany({ where: { locationId: { in: binIds } } })` and
 * reduce stored quantity per bin in memory.
 */

const LIST_TAKE = 500;

const BIN_KINDS = ['BIN', 'STORAGE'] as const;

function dec(v: Prisma.Decimal | null | undefined): number | null {
    if (v == null) return null;
    return typeof v === 'number' ? v : Number(v.toString());
}

export interface BinDto {
    id: string;
    name: string;
    key: string | null;
    kind: 'BIN' | 'STORAGE';
    description: string | null;
    capacityTonnes: number | null;
    /** Sum of `quantityOnHand` across the bin's HARVESTED_PRODUCE lots. */
    storedQuantity: number;
    /** Number of stored produce lots in the bin. */
    lotCount: number;
    /** storedQuantity / capacityTonnes when a capacity is set; else null. */
    fillPct: number | null;
}

/**
 * List the tenant's grain bins (BIN/STORAGE Locations) with a computed
 * fill. Fill = sum of `quantityOnHand` across the HARVESTED_PRODUCE lots
 * whose `locationId` is the bin. Both `storedQuantity` and `capacityTonnes`
 * are exposed so the caller can render either; `fillPct` is provided when a
 * capacity is set. (Units are assumed already in the lot's unit — Phase-1
 * grain lots are tonnes; no cross-unit conversion.)
 */
export async function listBins(ctx: RequestContext, opts: { take?: number } = {}): Promise<BinDto[]> {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const bins = await db.location.findMany({
            where: {
                tenantId: ctx.tenantId,
                deletedAt: null,
                kind: { in: [...BIN_KINDS] as LocationKind[] },
            },
            orderBy: [{ name: 'asc' }],
            select: { id: true, name: true, key: true, kind: true, description: true, capacityTonnes: true },
            take: opts.take ?? LIST_TAKE,
        });
        if (bins.length === 0) return [];

        // ── ONE query for the stored produce across every bin ──
        const binIds = bins.map((b) => b.id);
        const lots = await db.inventoryLot.findMany({
            where: {
                tenantId: ctx.tenantId,
                deletedAt: null,
                locationId: { in: binIds },
                item: { is: { category: 'HARVESTED_PRODUCE' } },
            },
            select: { locationId: true, quantityOnHand: true },
            take: LIST_TAKE,
        });
        const storedByBin = new Map<string, { qty: number; lots: number }>();
        for (const lot of lots) {
            if (!lot.locationId) continue;
            const agg = storedByBin.get(lot.locationId) ?? { qty: 0, lots: 0 };
            agg.qty += dec(lot.quantityOnHand) ?? 0;
            agg.lots += 1;
            storedByBin.set(lot.locationId, agg);
        }

        return bins.map((bin): BinDto => {
            const agg = storedByBin.get(bin.id) ?? { qty: 0, lots: 0 };
            const storedQuantity = Math.round(agg.qty * 1e4) / 1e4;
            const capacity = dec(bin.capacityTonnes);
            const fillPct = capacity != null && capacity > 0
                ? Math.round((storedQuantity / capacity) * 1e4) / 1e4
                : null;
            return {
                id: bin.id,
                name: bin.name,
                key: bin.key,
                kind: bin.kind as 'BIN' | 'STORAGE',
                description: bin.description,
                capacityTonnes: capacity,
                storedQuantity,
                lotCount: agg.lots,
                fillPct,
            };
        });
    });
}

export async function getBin(ctx: RequestContext, id: string): Promise<BinDto> {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const bin = await db.location.findFirst({
            where: {
                id,
                tenantId: ctx.tenantId,
                deletedAt: null,
                kind: { in: [...BIN_KINDS] as LocationKind[] },
            },
            select: { id: true, name: true, key: true, kind: true, description: true, capacityTonnes: true },
        });
        if (!bin) throw notFound('Grain bin not found');

        const lots = await db.inventoryLot.findMany({
            where: {
                tenantId: ctx.tenantId,
                deletedAt: null,
                locationId: bin.id,
                item: { is: { category: 'HARVESTED_PRODUCE' } },
            },
            select: { quantityOnHand: true },
            take: LIST_TAKE,
        });
        const storedQuantity = Math.round(
            lots.reduce((sum, l) => sum + (dec(l.quantityOnHand) ?? 0), 0) * 1e4,
        ) / 1e4;
        const capacity = dec(bin.capacityTonnes);
        return {
            id: bin.id,
            name: bin.name,
            key: bin.key,
            kind: bin.kind as 'BIN' | 'STORAGE',
            description: bin.description,
            capacityTonnes: capacity,
            storedQuantity,
            lotCount: lots.length,
            fillPct: capacity != null && capacity > 0
                ? Math.round((storedQuantity / capacity) * 1e4) / 1e4
                : null,
        };
    });
}

export async function createBin(ctx: RequestContext, input: CreateBinInput) {
    assertCanWrite(ctx);
    const name = sanitizePlainText(input.name ?? '');
    if (!name) throw badRequest('Bin name is required');
    const key = input.key != null ? sanitizePlainText(input.key) : null;
    const description = input.description != null ? sanitizePlainText(input.description) : null;
    if (input.capacityTonnes != null && input.capacityTonnes < 0) {
        throw badRequest('Bin capacity must be zero or positive');
    }
    const kind = input.kind ?? 'BIN';

    return runInTenantContext(ctx, async (db) => {
        const bin = await db.location.create({
            data: {
                tenantId: ctx.tenantId,
                name,
                key,
                description,
                kind,
                capacityTonnes: input.capacityTonnes ?? null,
                createdByUserId: ctx.userId ?? null,
            },
            select: { id: true, name: true, kind: true, capacityTonnes: true },
        });
        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'Location',
            entityId: bin.id,
            details: `Created grain bin: ${name}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Location',
                operation: 'created',
                after: { name, kind: bin.kind, capacityTonnes: input.capacityTonnes ?? null },
                summary: `Created grain ${kind.toLowerCase()} bin ${name}`,
            },
        });
        return { id: bin.id, name: bin.name, kind: bin.kind, capacityTonnes: dec(bin.capacityTonnes) };
    });
}

export async function updateBin(ctx: RequestContext, id: string, input: UpdateBinInput) {
    assertCanWrite(ctx);
    const data: Prisma.LocationUncheckedUpdateInput = {};
    if (input.name !== undefined) {
        const name = sanitizePlainText(input.name);
        if (!name) throw badRequest('Bin name is required');
        data.name = name;
    }
    if (input.key !== undefined) data.key = input.key != null ? sanitizePlainText(input.key) : null;
    if (input.description !== undefined) {
        data.description = input.description != null ? sanitizePlainText(input.description) : null;
    }
    if (input.kind !== undefined) data.kind = input.kind;
    if (input.capacityTonnes !== undefined) {
        if (input.capacityTonnes != null && input.capacityTonnes < 0) {
            throw badRequest('Bin capacity must be zero or positive');
        }
        data.capacityTonnes = input.capacityTonnes;
    }

    return runInTenantContext(ctx, async (db) => {
        const existing = await db.location.findFirst({
            where: {
                id,
                tenantId: ctx.tenantId,
                deletedAt: null,
                kind: { in: [...BIN_KINDS] as LocationKind[] },
            },
            select: { id: true },
        });
        if (!existing) throw notFound('Grain bin not found');

        const bin = await db.location.update({
            where: { id },
            data,
            select: { id: true, name: true, kind: true, capacityTonnes: true },
        });
        await logEvent(db, ctx, {
            action: 'UPDATE',
            entityType: 'Location',
            entityId: id,
            details: 'Grain bin updated',
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Location',
                operation: 'updated',
                changedFields: Object.keys(input).filter(
                    (k) => (input as Record<string, unknown>)[k] !== undefined,
                ),
                after: { name: bin.name, kind: bin.kind, capacityTonnes: dec(bin.capacityTonnes) },
                summary: `Updated grain bin ${bin.name}`,
            },
        });
        return { id: bin.id, name: bin.name, kind: bin.kind, capacityTonnes: dec(bin.capacityTonnes) };
    });
}
