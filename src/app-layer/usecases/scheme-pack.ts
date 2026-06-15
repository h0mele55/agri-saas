import { RequestContext } from '../types';
import { assertCanManageAuditPacks } from '../policies/audit-readiness.policies';
import { getScheme } from './certification-scheme';
import { createAuditPack, addAuditPackItems } from './audit-readiness/packs';
import { logEvent } from '../events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { badRequest } from '@/lib/errors/types';

/**
 * Scheme inspection pack — assemble an audit-ready pack for a certification
 * scheme (a global AG_SCHEME `Framework`).
 *
 * Reuses the existing audit-pack machinery end to end:
 *   • `createAuditPack(ctx, auditCycleId, name)` mints the DRAFT pack,
 *   • the pack is populated with one FRAMEWORK_COVERAGE item (the scheme
 *     itself) + one EVIDENCE item per APPROVED evidence row backing the
 *     scheme's requirements,
 *   • `addAuditPackItems(...)` writes them.
 *
 * The caller then FREEZES + SHARES the pack through the EXISTING audit-pack
 * freeze (`POST /audit/packs/:id/freeze`) and share
 * (`POST /audit/packs/:id/share` → `generateShareLink` / `AuditPackShare`)
 * endpoints — this module never re-implements sharing.
 *
 * Admin-gated via `assertCanManageAuditPacks` (OWNER/ADMIN/EDITOR), the
 * same gate the underlying pack usecases enforce.
 */

export interface AssembleSchemePackInput {
    schemeKey: string;
    auditCycleId: string;
    name: string;
}

export async function assembleSchemePack(ctx: RequestContext, input: AssembleSchemePackInput) {
    assertCanManageAuditPacks(ctx);

    // Verify the key really names an AG_SCHEME (getScheme throws notFound
    // for a non-scheme framework key). We need the framework id for the
    // coverage item + the requirement ids for the evidence query.
    const { framework } = await getScheme(ctx, input.schemeKey);
    if (framework.kind !== 'AG_SCHEME') throw badRequest('Not a certification scheme');

    // Resolve the APPROVED evidence backing this scheme: requirement →
    // control (ControlRequirementLink) → APPROVED, non-deleted Evidence.
    // Two findMany calls (no read-in-loop): collect controlIds, then pull
    // the approved evidence for them in one query.
    const evidenceIds = await runInTenantContext(ctx, async (db) => {
        const links = await db.controlRequirementLink.findMany({
            where: {
                tenantId: ctx.tenantId,
                requirement: { frameworkId: framework.id },
            },
            select: { controlId: true },
        });
        const controlIds = [...new Set(links.map((l) => l.controlId))];
        if (controlIds.length === 0) return [];

        const evidence = await db.evidence.findMany({
            where: {
                tenantId: ctx.tenantId,
                controlId: { in: controlIds },
                status: 'APPROVED',
                deletedAt: null,
                isArchived: false,
            },
            select: { id: true },
        });
        return evidence.map((e) => e.id);
    });

    // Mint the pack (reuses the audit-pack usecase — validates the cycle).
    const pack = await createAuditPack(ctx, input.auditCycleId, input.name);

    // One FRAMEWORK_COVERAGE item for the scheme + one EVIDENCE item per
    // approved evidence row. snapshotJson left empty ('{}') so the existing
    // freeze flow fills it from the live entity at freeze time.
    const items: Array<{ entityType: string; entityId: string; sortOrder?: number }> = [
        { entityType: 'FRAMEWORK_COVERAGE', entityId: framework.id, sortOrder: 0 },
        ...evidenceIds.map((id, i) => ({
            entityType: 'EVIDENCE',
            entityId: id,
            sortOrder: i + 1,
        })),
    ];
    const { created, skipped } = await addAuditPackItems(ctx, pack.id, items);

    await runInTenantContext(ctx, (db) =>
        logEvent(db, ctx, {
            action: 'SCHEME_PACK_ASSEMBLED',
            entityType: 'AuditPack',
            entityId: pack.id,
            details: `Scheme inspection pack assembled for ${input.schemeKey} (${created} items)`,
            detailsJson: {
                category: 'entity_lifecycle',
                entityName: 'AuditPack',
                operation: 'created',
                after: {
                    schemeKey: input.schemeKey,
                    frameworkId: framework.id,
                    evidenceItems: evidenceIds.length,
                    itemsCreated: created,
                },
                summary: `Scheme inspection pack assembled for ${input.schemeKey}`,
            },
        }),
    );

    return { pack, schemeKey: input.schemeKey, itemsCreated: created, itemsSkipped: skipped };
}
