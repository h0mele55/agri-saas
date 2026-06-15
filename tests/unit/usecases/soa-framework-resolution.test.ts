/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks + fake DB. */
/**
 * `resolveInstalledFrameworkKey` — the SoA report must reflect the
 * framework the tenant actually installed, not a hard-coded ISO 27001.
 *
 * A framework is "installed" when the tenant has a control linked to
 * one of its requirements (ControlRequirementLink — exactly what
 * installPack writes). Rules:
 *   - none installed       → 'ISO27001' fallback (fresh tenant baseline)
 *   - ISO 27001 installed  → 'ISO27001' (SoA is ISO-native; preferred)
 *   - only another pack     → that pack's key (the reported bug)
 */
const tenantDb: any = {
    framework: { findMany: jest.fn(), findFirst: jest.fn() },
    frameworkRequirement: { findMany: jest.fn() },
    controlRequirementLink: { findMany: jest.fn() },
    tenant: { findUnique: jest.fn() },
};

jest.mock('@/lib/db-context', () => {
    const actual = jest.requireActual('@/lib/db-context');
    return {
        ...actual,
        runInTenantContext: jest.fn(async (_ctx: any, cb: any) => cb(tenantDb)),
    };
});

import { resolveInstalledFrameworkKey, getSoA } from '@/app-layer/usecases/soa';
import { makeRequestContext } from '../../helpers/make-context';

const ctx = makeRequestContext('ADMIN');

beforeEach(() => {
    tenantDb.framework.findMany.mockReset();
});

describe('resolveInstalledFrameworkKey', () => {
    it('falls back to ISO27001 when nothing is installed', async () => {
        tenantDb.framework.findMany.mockResolvedValueOnce([]);
        expect(await resolveInstalledFrameworkKey(ctx)).toBe('ISO27001');
    });

    it('returns the installed pack when ISO 27001 is NOT installed', async () => {
        // The reported bug: tenant on NIS2, report showed ISO's 93.
        tenantDb.framework.findMany.mockResolvedValueOnce([{ key: 'NIS2' }]);
        expect(await resolveInstalledFrameworkKey(ctx)).toBe('NIS2');
    });

    it('prefers ISO 27001 when it is among the installed frameworks', async () => {
        tenantDb.framework.findMany.mockResolvedValueOnce([
            { key: 'NIS2' },
            { key: 'ISO27001' },
            { key: 'SOC2' },
        ]);
        expect(await resolveInstalledFrameworkKey(ctx)).toBe('ISO27001');
    });

    it('queries frameworks by a tenant-scoped control-requirement link', async () => {
        tenantDb.framework.findMany.mockResolvedValueOnce([{ key: 'SOC2' }]);
        await resolveInstalledFrameworkKey(ctx);
        const where = tenantDb.framework.findMany.mock.calls[0][0].where;
        expect(where).toEqual({
            requirements: {
                some: {
                    controlLinks: { some: { tenantId: ctx.tenantId } },
                },
            },
        });
    });
});

describe('getSoA — explicit frameworkKey option', () => {
    beforeEach(() => {
        tenantDb.framework.findMany.mockReset();
        tenantDb.framework.findFirst.mockReset();
        tenantDb.frameworkRequirement.findMany.mockReset();
        tenantDb.controlRequirementLink.findMany.mockReset();
        tenantDb.tenant.findUnique.mockReset();

        tenantDb.framework.findFirst.mockResolvedValue({ id: 'fw-scheme', name: 'GlobalG.A.P. demo', version: '2024-demo' });
        tenantDb.frameworkRequirement.findMany.mockResolvedValue([
            { id: 'req-1', code: 'CB.7.6', title: 'Application records', sortOrder: 1, section: 'CB.7' },
        ]);
        tenantDb.controlRequirementLink.findMany.mockResolvedValue([]);
        tenantDb.tenant.findUnique.mockResolvedValue({ slug: 'acme' });
    });

    it('pins the report to the explicit scheme key WITHOUT the installed-framework auto-detect', async () => {
        const report = await getSoA(ctx, { frameworkKey: 'GLOBALGAP-IFA-DEMO' });

        expect(report.framework).toBe('GLOBALGAP-IFA-DEMO');
        // The framework lookup used the pinned key.
        expect(tenantDb.framework.findFirst).toHaveBeenCalledWith({
            where: { key: 'GLOBALGAP-IFA-DEMO' },
        });
        // Auto-detection (framework.findMany on the installed-link shape) is NOT used.
        expect(tenantDb.framework.findMany).not.toHaveBeenCalled();
        expect(report.entries).toHaveLength(1);
        expect(report.entries[0].requirementCode).toBe('CB.7.6');
    });

    it('frameworkKey takes precedence over framework', async () => {
        await getSoA(ctx, { frameworkKey: 'GLOBALGAP-IFA-DEMO', framework: 'ISO27001' });
        expect(tenantDb.framework.findFirst).toHaveBeenCalledWith({
            where: { key: 'GLOBALGAP-IFA-DEMO' },
        });
    });
});
