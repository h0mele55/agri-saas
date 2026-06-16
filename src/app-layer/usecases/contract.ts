import { Prisma } from '@prisma/client';
import { RequestContext } from '../types';
import { runInTenantContext } from '@/lib/db-context';
import { assertCanRead, assertCanWrite } from '../policies/common';
import { logEvent } from '../events/audit';
import { notFound, badRequest } from '@/lib/errors/types';
import { sanitizePlainText } from '@/lib/security/sanitize';
import type {
    CreateContractInput,
    UpdateContractInput,
} from '../schemas/grain.schemas';

/**
 * Contracts — grain marketing / supply contracts (ENTERPRISE-grain, GRAIN
 * module). A forward SALE of produce or PURCHASE of inputs against a
 * counterparty.
 *
 * Shape mirrors `crop-planning.ts` exactly:
 *   - authorize via assertCanRead/Write BEFORE data access,
 *   - sanitize user free text at the boundary (counterparty / commodity /
 *     key / terms / pricingNotes → sanitizePlainText) — the last two are
 *     ALSO encrypted at rest by the Epic B manifest; sanitisation protects
 *     every downstream renderer that decrypts them,
 *   - the NUMERIC magnitudes (volumeTonnes / pricePerTonne) stay PLAINTEXT
 *     Decimals so the portfolio rollups can SUM them,
 *   - emit a hash-chained audit event on EVERY mutation,
 *   - all DB access through runInTenantContext (RLS-bound), every read
 *     tenant-scoped + bounded with `take:`.
 */

// Single cap for the contracts list read. Mirrors crop-planning's LIST_TAKE;
// the composite indexes ([tenantId,status] / [tenantId,type] /
// [tenantId,seasonId]) back the filtered reads.
const LIST_TAKE = 500;

/** Parse a wire date string → Date, or throw a 400. Null/undefined → null. */
function parseDate(value: string | null | undefined, label: string): Date | null {
    if (value == null) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw badRequest(`${label} must be a valid date`);
    return d;
}

export interface ContractListFilters {
    status?: string;
    type?: string;
    seasonId?: string;
}

export async function listContracts(
    ctx: RequestContext,
    filters: ContractListFilters = {},
    opts: { take?: number } = {},
) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, (db) =>
        db.contract.findMany({
            where: {
                tenantId: ctx.tenantId,
                deletedAt: null,
                ...(filters.status ? { status: filters.status as Prisma.EnumContractStatusFilter['equals'] } : {}),
                ...(filters.type ? { type: filters.type as Prisma.EnumContractTypeFilter['equals'] } : {}),
                ...(filters.seasonId ? { seasonId: filters.seasonId } : {}),
            },
            orderBy: [{ createdAt: 'desc' }],
            include: { season: { select: { id: true, name: true, status: true } } },
            take: opts.take ?? LIST_TAKE,
        }),
    );
}

export async function getContract(ctx: RequestContext, id: string) {
    assertCanRead(ctx);
    return runInTenantContext(ctx, async (db) => {
        const contract = await db.contract.findFirst({
            where: { id, tenantId: ctx.tenantId, deletedAt: null },
            include: { season: { select: { id: true, name: true, status: true } } },
        });
        if (!contract) throw notFound('Contract not found');
        return contract;
    });
}

export async function createContract(ctx: RequestContext, input: CreateContractInput) {
    assertCanWrite(ctx);

    const counterparty = sanitizePlainText(input.counterparty ?? '');
    if (!counterparty) throw badRequest('Contract counterparty is required');

    const key = input.key != null ? sanitizePlainText(input.key) : null;
    const commodity = input.commodity != null ? sanitizePlainText(input.commodity) : null;
    const terms = input.terms != null ? sanitizePlainText(input.terms) : null;
    const pricingNotes = input.pricingNotes != null ? sanitizePlainText(input.pricingNotes) : null;

    if (input.volumeTonnes != null && input.volumeTonnes < 0) {
        throw badRequest('Contract volume must be zero or positive');
    }
    if (input.pricePerTonne != null && input.pricePerTonne < 0) {
        throw badRequest('Contract price per tonne must be zero or positive');
    }
    const deliveryStart = parseDate(input.deliveryStart, 'Delivery start');
    const deliveryEnd = parseDate(input.deliveryEnd, 'Delivery end');
    if (deliveryStart && deliveryEnd && deliveryEnd < deliveryStart) {
        throw badRequest('Delivery end must be on or after the delivery start');
    }

    return runInTenantContext(ctx, async (db) => {
        if (input.seasonId) {
            const season = await db.season.findFirst({
                where: { id: input.seasonId, tenantId: ctx.tenantId, deletedAt: null },
                select: { id: true },
            });
            if (!season) throw badRequest('Season not found or belongs to a different tenant');
        }

        const contract = await db.contract.create({
            data: {
                tenantId: ctx.tenantId,
                seasonId: input.seasonId ?? null,
                key,
                counterparty,
                commodity,
                type: input.type ?? 'SALE',
                status: input.status ?? 'DRAFT',
                volumeTonnes: input.volumeTonnes ?? null,
                pricePerTonne: input.pricePerTonne ?? null,
                priceCurrency: input.priceCurrency ?? null,
                deliveryStart,
                deliveryEnd,
                terms,
                pricingNotes,
            },
        });
        await logEvent(db, ctx, {
            action: 'CREATE',
            entityType: 'Contract',
            entityId: contract.id,
            details: `Created ${contract.type.toLowerCase()} contract: ${counterparty}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Contract',
                operation: 'created',
                after: {
                    counterparty,
                    type: contract.type,
                    status: contract.status,
                    volumeTonnes: input.volumeTonnes ?? null,
                },
                summary: `Created ${contract.type.toLowerCase()} contract with ${counterparty}`,
            },
        });
        return contract;
    });
}

export async function updateContract(ctx: RequestContext, id: string, input: UpdateContractInput) {
    assertCanWrite(ctx);

    const data: Prisma.ContractUncheckedUpdateInput = {};
    if (input.counterparty !== undefined) {
        const counterparty = sanitizePlainText(input.counterparty);
        if (!counterparty) throw badRequest('Contract counterparty is required');
        data.counterparty = counterparty;
    }
    if (input.key !== undefined) data.key = input.key != null ? sanitizePlainText(input.key) : null;
    if (input.commodity !== undefined) {
        data.commodity = input.commodity != null ? sanitizePlainText(input.commodity) : null;
    }
    if (input.terms !== undefined) data.terms = input.terms != null ? sanitizePlainText(input.terms) : null;
    if (input.pricingNotes !== undefined) {
        data.pricingNotes = input.pricingNotes != null ? sanitizePlainText(input.pricingNotes) : null;
    }
    if (input.seasonId !== undefined) data.seasonId = input.seasonId;
    if (input.type !== undefined) data.type = input.type;
    if (input.status !== undefined) data.status = input.status;
    if (input.volumeTonnes !== undefined) {
        if (input.volumeTonnes != null && input.volumeTonnes < 0) {
            throw badRequest('Contract volume must be zero or positive');
        }
        data.volumeTonnes = input.volumeTonnes;
    }
    if (input.pricePerTonne !== undefined) {
        if (input.pricePerTonne != null && input.pricePerTonne < 0) {
            throw badRequest('Contract price per tonne must be zero or positive');
        }
        data.pricePerTonne = input.pricePerTonne;
    }
    if (input.priceCurrency !== undefined) data.priceCurrency = input.priceCurrency;
    if (input.deliveryStart !== undefined) data.deliveryStart = parseDate(input.deliveryStart, 'Delivery start');
    if (input.deliveryEnd !== undefined) data.deliveryEnd = parseDate(input.deliveryEnd, 'Delivery end');

    return runInTenantContext(ctx, async (db) => {
        const existing = await db.contract.findFirst({
            where: { id, tenantId: ctx.tenantId, deletedAt: null },
            select: { id: true },
        });
        if (!existing) throw notFound('Contract not found');
        if (input.seasonId) {
            const season = await db.season.findFirst({
                where: { id: input.seasonId, tenantId: ctx.tenantId, deletedAt: null },
                select: { id: true },
            });
            if (!season) throw badRequest('Season not found or belongs to a different tenant');
        }

        const contract = await db.contract.update({ where: { id }, data });
        await logEvent(db, ctx, {
            action: 'UPDATE',
            entityType: 'Contract',
            entityId: id,
            details: 'Contract updated',
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Contract',
                operation: 'updated',
                changedFields: Object.keys(input).filter(
                    (k) => (input as Record<string, unknown>)[k] !== undefined,
                ),
                after: { counterparty: contract.counterparty, status: contract.status },
                summary: 'Contract updated',
            },
        });
        return contract;
    });
}

export async function deleteContract(ctx: RequestContext, id: string) {
    assertCanWrite(ctx);
    return runInTenantContext(ctx, async (db) => {
        const existing = await db.contract.findFirst({
            where: { id, tenantId: ctx.tenantId, deletedAt: null },
            select: { id: true, counterparty: true },
        });
        if (!existing) throw notFound('Contract not found');

        const contract = await db.contract.update({
            where: { id },
            data: { deletedAt: new Date(), deletedByUserId: ctx.userId ?? null },
            select: { id: true },
        });
        await logEvent(db, ctx, {
            action: 'DELETE',
            entityType: 'Contract',
            entityId: id,
            details: `Deleted contract: ${existing.counterparty}`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'Contract',
                operation: 'deleted',
                before: { counterparty: existing.counterparty },
                summary: `Deleted contract with ${existing.counterparty}`,
            },
        });
        return { id: contract.id, deleted: true };
    });
}
