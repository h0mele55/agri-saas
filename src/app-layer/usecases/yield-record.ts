import { Prisma } from '@prisma/client';
import { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { assertCanRead, assertCanWrite } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound, badRequest } from '@/lib/errors/types';
import { sanitizePlainText } from '@/lib/security/sanitize';
import type {
    CreateYieldRecordInput,
    UpdateYieldRecordInput,
} from '../schemas/grain.schemas';

/**
 * Yield records — actual harvest production totals (ENTERPRISE-grain, GRAIN
 * module). Gross tonnes realised against a Planting / field / Season with
 * the moisture basis + area for a t/ha derivation.
 *
 * Shape mirrors `crop-planning.ts`:
 *   - authorize via assertCanRead/Write BEFORE data access,
 *   - sanitize user free text (commodity / valuationNotes →
 *     sanitizePlainText) — valuationNotes is ALSO encrypted at rest by the
 *     Epic B manifest,
 *   - the NUMERIC magnitudes (grossTonnes / moisturePct / areaHa) stay
 *     PLAINTEXT Decimals so the yield rollups can SUM them,
 *   - emit a hash-chained audit event on EVERY mutation,
 *   - all DB access through runInTenantContext (RLS-bound) + bounded `take:`.
 */

const LIST_TAKE = 500;

/** Prisma Decimal | null → plain number | null. */
function dec(v: Prisma.Decimal | null | undefined): number | null {
    if (v == null) return null;
    return typeof v === 'number' ? v : Number(v.toString());
}

function parseDate(value: string | null | undefined, label: string): Date | null {
    if (value == null) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw badRequest(`${label} must be a valid date`);
    return d;
}

/**
 * Shape a YieldRecord row into a DTO, adding the COMPUTED (not stored)
 * `tPerHa = grossTonnes / areaHa`. Null when either input is missing or
 * area is zero.
 */
function toDto(row: {
    id: string;
    plantingId: string | null;
    locationId: string | null;
    seasonId: string | null;
    commodity: string | null;
    harvestedAt: Date | null;
    grossTonnes: Prisma.Decimal | null;
    moisturePct: Prisma.Decimal | null;
    areaHa: Prisma.Decimal | null;
    valuationNotes: string | null;
    createdAt: Date;
    updatedAt: Date;
    planting?: { id: string; successionNumber: number } | null;
    location?: { id: string; name: string } | null;
    season?: { id: string; name: string } | null;
}) {
    const grossTonnes = dec(row.grossTonnes);
    const areaHa = dec(row.areaHa);
    const tPerHa = grossTonnes != null && areaHa != null && areaHa > 0
        ? Math.round((grossTonnes / areaHa) * 1e4) / 1e4
        : null;
    return {
        id: row.id,
        plantingId: row.plantingId,
        locationId: row.locationId,
        seasonId: row.seasonId,
        commodity: row.commodity,
        harvestedAt: row.harvestedAt,
        grossTonnes,
        moisturePct: dec(row.moisturePct),
        areaHa,
        tPerHa,
        valuationNotes: row.valuationNotes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        planting: row.planting ?? null,
        location: row.location ?? null,
        season: row.season ?? null,
    };
}

const YIELD_INCLUDE = {
    planting: { select: { id: true, successionNumber: true } },
    location: { select: { id: true, name: true } },
    season: { select: { id: true, name: true } },
} satisfies Prisma.YieldRecordInclude;

export interface YieldRecordListFilters {
    seasonId?: string;
    locationId?: string;
    plantingId?: string;
}

export async function listYieldRecords(
    ctx: RequestContext,
    filters: YieldRecordListFilters = {},
    opts: { take?: number } = {},
) {
    assertCanRead(ctx);
    const rows = await runInTenantContext(ctx, (db) =>
        db.yieldRecord.findMany({
            where: {
                tenantId: ctx.tenantId,
                deletedAt: null,
                ...(filters.seasonId ? { seasonId: filters.seasonId } : {}),
                ...(filters.locationId ? { locationId: filters.locationId } : {}),
                ...(filters.plantingId ? { plantingId: filters.plantingId } : {}),
            },
            orderBy: [{ harvestedAt: 'desc' }, { createdAt: 'desc' }],
            include: YIELD_INCLUDE,
            take: opts.take ?? LIST_TAKE,
        }),
    );
    return rows.map(toDto);
}

export async function getYieldRecord(ctx: RequestContext, id: string) {
    assertCanRead(ctx);
    const row = await runInTenantContext(ctx, async (db) => {
        const record = await db.yieldRecord.findFirst({
            where: { id, tenantId: ctx.tenantId, deletedAt: null },
            include: YIELD_INCLUDE,
        });
        if (!record) throw notFound('Yield record not found');
        return record;
    });
    return toDto(row);
}

export async function createYieldRecord(ctx: RequestContext, input: CreateYieldRecordInput) {
    assertCanWrite(ctx);

    const commodity = input.commodity != null ? sanitizePlainText(input.commodity) : null;
    const valuationNotes = input.valuationNotes != null ? sanitizePlainText(input.valuationNotes) : null;
    if (input.grossTonnes != null && input.grossTonnes < 0) {
        throw badRequest('Gross tonnes must be zero or positive');
    }
    if (input.areaHa != null && input.areaHa < 0) {
        throw badRequest('Area must be zero or positive');
    }
    const harvestedAt = parseDate(input.harvestedAt, 'Harvested-at date');

    const row = await runInTenantContext(ctx, async (db) => {
        // Validate optional FKs belong to the tenant.
        if (input.plantingId) {
            const planting = await db.planting.findFirst({
                where: { id: input.plantingId, tenantId: ctx.tenantId, deletedAt: null },
                select: { id: true },
            });
            if (!planting) throw badRequest('Planting not found or belongs to a different tenant');
        }
        if (input.locationId) {
            const location = await db.location.findFirst({
                where: { id: input.locationId, tenantId: ctx.tenantId, deletedAt: null },
                select: { id: true },
            });
            if (!location) throw badRequest('Location not found or belongs to a different tenant');
        }
        if (input.seasonId) {
            const season = await db.season.findFirst({
                where: { id: input.seasonId, tenantId: ctx.tenantId, deletedAt: null },
                select: { id: true },
            });
            if (!season) throw badRequest('Season not found or belongs to a different tenant');
        }

        const record = await db.yieldRecord.create({
            data: {
                tenantId: ctx.tenantId,
                plantingId: input.plantingId ?? null,
                locationId: input.locationId ?? null,
                seasonId: input.seasonId ?? null,
                commodity,
                harvestedAt,
                grossTonnes: input.grossTonnes ?? null,
                moisturePct: input.moisturePct ?? null,
                areaHa: input.areaHa ?? null,
                valuationNotes,
            },
            include: YIELD_INCLUDE,
        });
        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'YieldRecord',
            entityId: record.id,
            details: `Recorded yield: ${commodity ?? 'harvest'} (${input.grossTonnes ?? 0} t)`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'YieldRecord',
                operation: 'created',
                after: { commodity, grossTonnes: input.grossTonnes ?? null, seasonId: input.seasonId ?? null },
                summary: `Recorded ${input.grossTonnes ?? 0} t of ${commodity ?? 'harvest'}`,
            },
        });
        return record;
    });
    return toDto(row);
}

export async function updateYieldRecord(ctx: RequestContext, id: string, input: UpdateYieldRecordInput) {
    assertCanWrite(ctx);

    const data: Prisma.YieldRecordUncheckedUpdateInput = {};
    if (input.commodity !== undefined) {
        data.commodity = input.commodity != null ? sanitizePlainText(input.commodity) : null;
    }
    if (input.valuationNotes !== undefined) {
        data.valuationNotes = input.valuationNotes != null ? sanitizePlainText(input.valuationNotes) : null;
    }
    if (input.plantingId !== undefined) data.plantingId = input.plantingId;
    if (input.locationId !== undefined) data.locationId = input.locationId;
    if (input.seasonId !== undefined) data.seasonId = input.seasonId;
    if (input.harvestedAt !== undefined) data.harvestedAt = parseDate(input.harvestedAt, 'Harvested-at date');
    if (input.grossTonnes !== undefined) {
        if (input.grossTonnes != null && input.grossTonnes < 0) {
            throw badRequest('Gross tonnes must be zero or positive');
        }
        data.grossTonnes = input.grossTonnes;
    }
    if (input.moisturePct !== undefined) data.moisturePct = input.moisturePct;
    if (input.areaHa !== undefined) {
        if (input.areaHa != null && input.areaHa < 0) {
            throw badRequest('Area must be zero or positive');
        }
        data.areaHa = input.areaHa;
    }

    const row = await runInTenantContext(ctx, async (db) => {
        const existing = await db.yieldRecord.findFirst({
            where: { id, tenantId: ctx.tenantId, deletedAt: null },
            select: { id: true },
        });
        if (!existing) throw notFound('Yield record not found');
        if (input.plantingId) {
            const planting = await db.planting.findFirst({
                where: { id: input.plantingId, tenantId: ctx.tenantId, deletedAt: null },
                select: { id: true },
            });
            if (!planting) throw badRequest('Planting not found or belongs to a different tenant');
        }
        if (input.locationId) {
            const location = await db.location.findFirst({
                where: { id: input.locationId, tenantId: ctx.tenantId, deletedAt: null },
                select: { id: true },
            });
            if (!location) throw badRequest('Location not found or belongs to a different tenant');
        }
        if (input.seasonId) {
            const season = await db.season.findFirst({
                where: { id: input.seasonId, tenantId: ctx.tenantId, deletedAt: null },
                select: { id: true },
            });
            if (!season) throw badRequest('Season not found or belongs to a different tenant');
        }

        const record = await db.yieldRecord.update({ where: { id }, data, include: YIELD_INCLUDE });
        await logEvent(db, ctx, {
            action: 'UPDATE',
            entityType: 'YieldRecord',
            entityId: id,
            details: 'Yield record updated',
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'YieldRecord',
                operation: 'updated',
                changedFields: Object.keys(input).filter(
                    (k) => (input as Record<string, unknown>)[k] !== undefined,
                ),
                after: { commodity: record.commodity, grossTonnes: dec(record.grossTonnes) },
                summary: 'Yield record updated',
            },
        });
        return record;
    });
    return toDto(row);
}

export async function deleteYieldRecord(ctx: RequestContext, id: string) {
    assertCanWrite(ctx);
    return runInTenantContext(ctx, async (db) => {
        const existing = await db.yieldRecord.findFirst({
            where: { id, tenantId: ctx.tenantId, deletedAt: null },
            select: { id: true, commodity: true },
        });
        if (!existing) throw notFound('Yield record not found');

        await db.yieldRecord.update({
            where: { id },
            data: { deletedAt: new Date(), deletedByUserId: ctx.userId ?? null },
            select: { id: true },
        });
        await logEvent(db, ctx, {
            action: 'DELETE',
            entityType: 'YieldRecord',
            entityId: id,
            details: `Deleted yield record: ${existing.commodity ?? 'harvest'}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'YieldRecord',
                operation: 'deleted',
                before: { commodity: existing.commodity },
                summary: `Deleted yield record for ${existing.commodity ?? 'harvest'}`,
            },
        });
        return { id, deleted: true };
    });
}
