/**
 * sample-data usecase — the tenant-context DB is mocked so we assert the
 * tagging + tenant-scoping + idempotency, not Prisma. Mirrors the
 * achievements.test.ts mocking shape (runInTenantContext passes our mock
 * db straight through; logEvent / prisma are stubbed).
 */
import type { RequestContext } from '@/app-layer/types';

const db = {
    location: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    parcel: { createMany: jest.fn(), updateMany: jest.fn() },
    inventoryLot: { create: jest.fn(), updateMany: jest.fn() },
    logEntry: { createMany: jest.fn(), updateMany: jest.fn() },
    item: { findFirst: jest.fn(), create: jest.fn() },
    unit: { findFirst: jest.fn() },
};
jest.mock('@/lib/db-context', () => ({
    runInTenantContext: (_ctx: unknown, cb: (d: unknown) => unknown) => cb(db),
}));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));
const logEvent = jest.fn();
jest.mock('@/app-layer/events/audit', () => ({ logEvent: (...args: unknown[]) => logEvent(...args) }));

import { hasSampleData, loadSampleData, clearSampleData } from '@/app-layer/usecases/sample-data';

const ctx = {
    tenantId: 't1',
    userId: 'u1',
    requestId: 'r1',
    permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: false, canExport: true },
} as unknown as RequestContext;

beforeEach(() => {
    for (const model of Object.values(db)) {
        for (const fn of Object.values(model)) (fn as jest.Mock).mockReset();
    }
    logEvent.mockReset();
});

describe('hasSampleData', () => {
    it('true when a non-deleted sample Location exists', async () => {
        db.location.findFirst.mockResolvedValue({ id: 'loc1' });
        await expect(hasSampleData(ctx)).resolves.toBe(true);
        expect(db.location.findFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { tenantId: 't1', isSampleData: true, deletedAt: null },
            }),
        );
    });

    it('false when none exists', async () => {
        db.location.findFirst.mockResolvedValue(null);
        await expect(hasSampleData(ctx)).resolves.toBe(false);
    });
});

describe('loadSampleData', () => {
    it('no-ops when sample data already exists', async () => {
        db.location.findFirst.mockResolvedValue({ id: 'loc1' });
        await expect(loadSampleData(ctx)).resolves.toEqual({ created: false });
        expect(db.location.create).not.toHaveBeenCalled();
        expect(db.parcel.createMany).not.toHaveBeenCalled();
    });

    it('creates a tagged, tenant-scoped dataset when empty', async () => {
        db.location.findFirst.mockResolvedValue(null); // both the pre-check and the in-context re-check
        db.location.create.mockResolvedValue({ id: 'loc-new' });
        db.parcel.createMany.mockResolvedValue({ count: 3 });
        db.unit.findFirst.mockResolvedValue({ id: 'unit-kg' });
        db.item.findFirst.mockResolvedValue(null);
        db.item.create.mockResolvedValue({ id: 'item-1' });
        db.inventoryLot.create.mockResolvedValue({ id: 'lot-1' });
        db.logEntry.createMany.mockResolvedValue({ count: 2 });

        await expect(loadSampleData(ctx)).resolves.toEqual({ created: true });

        // Location tagged + tenant-scoped.
        expect(db.location.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ tenantId: 't1', isSampleData: true }),
            }),
        );
        // Every parcel tagged + tenant-scoped + linked to the new location.
        const parcelArg = db.parcel.createMany.mock.calls[0][0];
        expect(parcelArg.data.length).toBeGreaterThanOrEqual(2);
        for (const p of parcelArg.data) {
            expect(p).toMatchObject({ tenantId: 't1', locationId: 'loc-new', isSampleData: true });
        }
        // Lot tagged + tenant-scoped.
        expect(db.inventoryLot.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({ tenantId: 't1', isSampleData: true }),
            }),
        );
        // LogEntries tagged + tenant-scoped.
        const logArg = db.logEntry.createMany.mock.calls[0][0];
        for (const e of logArg.data) {
            expect(e).toMatchObject({ tenantId: 't1', isSampleData: true });
        }
        // Audited.
        expect(logEvent).toHaveBeenCalledWith(
            db,
            ctx,
            expect.objectContaining({ action: 'SAMPLE_DATA_LOADED' }),
        );
    });

    it('skips the lot when no unit catalog exists (still creates the rest)', async () => {
        db.location.findFirst.mockResolvedValue(null);
        db.location.create.mockResolvedValue({ id: 'loc-new' });
        db.parcel.createMany.mockResolvedValue({ count: 3 });
        db.unit.findFirst.mockResolvedValue(null);
        db.logEntry.createMany.mockResolvedValue({ count: 2 });

        await expect(loadSampleData(ctx)).resolves.toEqual({ created: true });
        expect(db.inventoryLot.create).not.toHaveBeenCalled();
        expect(db.item.create).not.toHaveBeenCalled();
    });
});

describe('clearSampleData', () => {
    it('soft-deletes ONLY isSampleData rows across the four models, tenant-scoped', async () => {
        db.logEntry.updateMany.mockResolvedValue({ count: 2 });
        db.inventoryLot.updateMany.mockResolvedValue({ count: 1 });
        db.parcel.updateMany.mockResolvedValue({ count: 3 });
        db.location.updateMany.mockResolvedValue({ count: 1 });

        await expect(clearSampleData(ctx)).resolves.toEqual({ cleared: 7 });

        const expectedWhere = { tenantId: 't1', isSampleData: true, deletedAt: null };
        for (const model of [db.logEntry, db.inventoryLot, db.parcel, db.location]) {
            expect(model.updateMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expectedWhere,
                    data: expect.objectContaining({ deletedAt: expect.any(Date), deletedByUserId: 'u1' }),
                }),
            );
        }
        expect(logEvent).toHaveBeenCalledWith(
            db,
            ctx,
            expect.objectContaining({ action: 'SAMPLE_DATA_CLEARED' }),
        );
    });

    it('idempotent — clears nothing and skips the audit when there is no sample data', async () => {
        for (const model of [db.logEntry, db.inventoryLot, db.parcel, db.location]) {
            model.updateMany.mockResolvedValue({ count: 0 });
        }
        await expect(clearSampleData(ctx)).resolves.toEqual({ cleared: 0 });
        expect(logEvent).not.toHaveBeenCalled();
    });
});
