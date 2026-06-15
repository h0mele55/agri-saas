/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * Unit tests for `src/app-layer/usecases/scheme-pack.ts`.
 *
 * `assembleSchemePack(ctx, { schemeKey, auditCycleId, name })` reuses the
 * existing audit-pack machinery: it creates the pack via `createAuditPack`
 * and populates it via `addAuditPackItems` with one FRAMEWORK_COVERAGE
 * item + one EVIDENCE item per APPROVED evidence backing the scheme's
 * requirements. Mocks getScheme, the pack usecases, runInTenantContext,
 * and the audit emitter.
 */

const mockDb = {
    controlRequirementLink: { findMany: jest.fn() },
    evidence: { findMany: jest.fn() },
} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, cb: any) => cb(mockDb)),
}));

jest.mock('@/app-layer/usecases/certification-scheme', () => ({
    getScheme: jest.fn(),
}));

jest.mock('@/app-layer/usecases/audit-readiness/packs', () => ({
    createAuditPack: jest.fn(),
    addAuditPackItems: jest.fn(),
}));

jest.mock('@/app-layer/events/audit', () => ({
    logEvent: jest.fn(),
}));

import { getScheme } from '@/app-layer/usecases/certification-scheme';
import { createAuditPack, addAuditPackItems } from '@/app-layer/usecases/audit-readiness/packs';
import { logEvent } from '@/app-layer/events/audit';
import { assembleSchemePack } from '@/app-layer/usecases/scheme-pack';
import { makeRequestContext } from '../helpers/make-context';

const adminCtx = makeRequestContext('ADMIN', { userId: 'user-admin' });
const editorCtx = makeRequestContext('EDITOR', { userId: 'user-editor' });
const readerCtx = makeRequestContext('READER');

const SCHEME = { id: 'fw-scheme', key: 'GLOBALGAP-IFA-DEMO', kind: 'AG_SCHEME', name: 'GlobalG.A.P. demo' };

beforeEach(() => {
    jest.clearAllMocks();
    (getScheme as jest.Mock).mockResolvedValue({ framework: SCHEME, requirements: [] });
    (createAuditPack as jest.Mock).mockResolvedValue({ id: 'pack-1', name: 'Q3 inspection' });
    (addAuditPackItems as jest.Mock).mockResolvedValue({ created: 3, skipped: 0 });
    mockDb.controlRequirementLink.findMany.mockResolvedValue([
        { controlId: 'ctrl-1' },
        { controlId: 'ctrl-1' },
        { controlId: 'ctrl-2' },
    ]);
    mockDb.evidence.findMany.mockResolvedValue([{ id: 'ev-1' }, { id: 'ev-2' }]);
});

describe('assembleSchemePack — authorization', () => {
    it('rejects a READER before any write', async () => {
        await expect(
            assembleSchemePack(readerCtx, { schemeKey: 'X', auditCycleId: 'c1', name: 'n' }),
        ).rejects.toThrow();
        expect(createAuditPack).not.toHaveBeenCalled();
    });

    it('allows an EDITOR (manage-audit-packs gate)', async () => {
        await assembleSchemePack(editorCtx, { schemeKey: 'GLOBALGAP-IFA-DEMO', auditCycleId: 'c1', name: 'n' });
        expect(createAuditPack).toHaveBeenCalled();
    });
});

describe('assembleSchemePack — pack assembly', () => {
    it('verifies the scheme, creates the pack, and adds coverage + approved-evidence items', async () => {
        const result = await assembleSchemePack(adminCtx, {
            schemeKey: 'GLOBALGAP-IFA-DEMO',
            auditCycleId: 'cycle-1',
            name: 'Q3 inspection',
        });

        expect(getScheme).toHaveBeenCalledWith(adminCtx, 'GLOBALGAP-IFA-DEMO');
        expect(createAuditPack).toHaveBeenCalledWith(adminCtx, 'cycle-1', 'Q3 inspection');

        // Items: 1 FRAMEWORK_COVERAGE (the scheme framework) + 1 EVIDENCE per approved row.
        const [, packId, items] = (addAuditPackItems as jest.Mock).mock.calls[0];
        expect(packId).toBe('pack-1');
        expect(items[0]).toEqual({ entityType: 'FRAMEWORK_COVERAGE', entityId: 'fw-scheme', sortOrder: 0 });
        expect(items.filter((i: any) => i.entityType === 'EVIDENCE')).toEqual([
            { entityType: 'EVIDENCE', entityId: 'ev-1', sortOrder: 1 },
            { entityType: 'EVIDENCE', entityId: 'ev-2', sortOrder: 2 },
        ]);

        expect(result.pack).toEqual({ id: 'pack-1', name: 'Q3 inspection' });
        expect(result.itemsCreated).toBe(3);
    });

    it('queries only APPROVED, non-deleted evidence for the scheme controls', async () => {
        await assembleSchemePack(adminCtx, { schemeKey: 'GLOBALGAP-IFA-DEMO', auditCycleId: 'c1', name: 'n' });
        const where = mockDb.evidence.findMany.mock.calls[0][0].where;
        expect(where).toMatchObject({
            tenantId: 'tenant-1',
            controlId: { in: ['ctrl-1', 'ctrl-2'] },
            status: 'APPROVED',
            deletedAt: null,
        });
    });

    it('still creates a pack (coverage item only) when the scheme has no approved evidence', async () => {
        mockDb.controlRequirementLink.findMany.mockResolvedValue([]);
        (addAuditPackItems as jest.Mock).mockResolvedValue({ created: 1, skipped: 0 });

        await assembleSchemePack(adminCtx, { schemeKey: 'GLOBALGAP-IFA-DEMO', auditCycleId: 'c1', name: 'n' });

        // No controls → evidence query skipped → only the coverage item.
        expect(mockDb.evidence.findMany).not.toHaveBeenCalled();
        const items = (addAuditPackItems as jest.Mock).mock.calls[0][2];
        expect(items).toEqual([{ entityType: 'FRAMEWORK_COVERAGE', entityId: 'fw-scheme', sortOrder: 0 }]);
    });

    it('rejects a non-AG_SCHEME framework key', async () => {
        (getScheme as jest.Mock).mockResolvedValue({
            framework: { id: 'fw-x', key: 'ISO27001', kind: 'ISO_STANDARD' },
            requirements: [],
        });
        await expect(
            assembleSchemePack(adminCtx, { schemeKey: 'ISO27001', auditCycleId: 'c1', name: 'n' }),
        ).rejects.toThrow(/certification scheme/i);
        expect(createAuditPack).not.toHaveBeenCalled();
    });

    it('emits a SCHEME_PACK_ASSEMBLED audit event', async () => {
        await assembleSchemePack(adminCtx, { schemeKey: 'GLOBALGAP-IFA-DEMO', auditCycleId: 'c1', name: 'n' });
        expect(logEvent).toHaveBeenCalledTimes(1);
        const [, , payload] = (logEvent as jest.Mock).mock.calls[0];
        expect(payload.action).toBe('SCHEME_PACK_ASSEMBLED');
        expect(payload.entityType).toBe('AuditPack');
        expect(payload.detailsJson).toMatchObject({
            category: 'entity_lifecycle',
            entityName: 'AuditPack',
            operation: 'created',
        });
    });
});
