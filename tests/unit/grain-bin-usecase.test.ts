/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * Unit tests for `src/app-layer/usecases/grain-bin.ts`.
 *
 * Covers:
 *   - listBins — read gate, BIN/STORAGE-only filter, ONE batched lot query
 *     (no N+1), per-bin fill reduction + fillPct.
 *   - createBin / updateBin — sanitises name/description/key, audits as a
 *     Location, non-negative capacity guard.
 */

const mockDb = {
    location: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    inventoryLot: { findMany: jest.fn() },
} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockDb)),
}));

jest.mock('@/app-layer/events/audit', () => ({
    logEvent: jest.fn(),
}));

jest.mock('@/lib/security/sanitize', () => ({
    sanitizePlainText: jest.fn((s: string) => `SAN::${s}`),
}));

import { logEvent } from '@/app-layer/events/audit';
import { sanitizePlainText } from '@/lib/security/sanitize';
import { listBins, createBin, updateBin } from '@/app-layer/usecases/grain-bin';
import { makeRequestContext } from '../helpers/make-context';

beforeEach(() => {
    jest.clearAllMocks();
});

const adminCtx = makeRequestContext('ADMIN', { tenantSlug: 'acme', tenantId: 'tenant-1', userId: 'user-1' });
const readerCtx = makeRequestContext('READER', { tenantSlug: 'acme', tenantId: 'tenant-1' });

describe('listBins', () => {
    it('filters to BIN/STORAGE kinds and computes fill in ONE lot query (no N+1)', async () => {
        mockDb.location.findMany.mockResolvedValue([
            { id: 'bin-1', name: 'Bin A', key: null, kind: 'BIN', description: null, capacityTonnes: 100 },
            { id: 'bin-2', name: 'Bin B', key: null, kind: 'STORAGE', description: null, capacityTonnes: null },
        ]);
        // ONE findMany returns lots across BOTH bins.
        mockDb.inventoryLot.findMany.mockResolvedValue([
            { locationId: 'bin-1', quantityOnHand: 30 },
            { locationId: 'bin-1', quantityOnHand: 15 },
            { locationId: 'bin-2', quantityOnHand: 8 },
        ]);

        const bins = await listBins(adminCtx);

        // Bin filter applied.
        const locArgs = mockDb.location.findMany.mock.calls[0][0];
        expect(locArgs.where.kind).toEqual({ in: ['BIN', 'STORAGE'] });
        expect(locArgs.where).toMatchObject({ tenantId: 'tenant-1', deletedAt: null });

        // Exactly ONE inventoryLot query for the whole list (the N+1 guard).
        expect(mockDb.inventoryLot.findMany).toHaveBeenCalledTimes(1);
        const lotArgs = mockDb.inventoryLot.findMany.mock.calls[0][0];
        expect(lotArgs.where.locationId).toEqual({ in: ['bin-1', 'bin-2'] });
        expect(lotArgs.where.item).toEqual({ is: { category: 'HARVESTED_PRODUCE' } });

        // Bin A: stored 45 / capacity 100 ⇒ fill 0.45 ; 2 lots.
        expect(bins[0]).toMatchObject({ id: 'bin-1', storedQuantity: 45, capacityTonnes: 100, fillPct: 0.45, lotCount: 2 });
        // Bin B: no capacity ⇒ fillPct null ; stored 8.
        expect(bins[1]).toMatchObject({ id: 'bin-2', storedQuantity: 8, capacityTonnes: null, fillPct: null, lotCount: 1 });
    });

    it('short-circuits with no lot query when there are no bins', async () => {
        mockDb.location.findMany.mockResolvedValue([]);
        const bins = await listBins(adminCtx);
        expect(bins).toEqual([]);
        expect(mockDb.inventoryLot.findMany).not.toHaveBeenCalled();
    });
});

describe('createBin', () => {
    it('sanitises name/description/key, defaults kind BIN, audits as Location', async () => {
        mockDb.location.create.mockResolvedValue({ id: 'bin-1', name: 'SAN::Bin A', kind: 'BIN', capacityTonnes: 100 });
        await createBin(adminCtx, { name: 'Bin A', description: 'main store', key: 'BIN-A', capacityTonnes: 100 });
        expect(sanitizePlainText).toHaveBeenCalledWith('Bin A');
        expect(sanitizePlainText).toHaveBeenCalledWith('main store');
        expect(sanitizePlainText).toHaveBeenCalledWith('BIN-A');
        const data = mockDb.location.create.mock.calls[0][0].data;
        expect(data).toMatchObject({ tenantId: 'tenant-1', name: 'SAN::Bin A', kind: 'BIN', capacityTonnes: 100 });
        const payload = (logEvent as jest.Mock).mock.calls[0][2];
        expect(payload.entityType).toBe('Location');
        expect(payload.detailsJson.summary).toMatch(/grain/i);
    });

    it('rejects a negative capacity', async () => {
        await expect(createBin(adminCtx, { name: 'Bin A', capacityTonnes: -1 })).rejects.toThrow(/zero or positive/i);
    });

    it('READER cannot create', async () => {
        await expect(createBin(readerCtx, { name: 'Bin A' })).rejects.toThrow();
        expect(mockDb.location.create).not.toHaveBeenCalled();
    });
});

describe('updateBin', () => {
    it('throws notFound when the bin is missing (or is a FIELD)', async () => {
        mockDb.location.findFirst.mockResolvedValue(null);
        await expect(updateBin(adminCtx, 'missing', { name: 'X' })).rejects.toThrow(/not found/i);
    });

    it('updates + audits', async () => {
        mockDb.location.findFirst.mockResolvedValue({ id: 'bin-1' });
        mockDb.location.update.mockResolvedValue({ id: 'bin-1', name: 'SAN::Bin A2', kind: 'BIN', capacityTonnes: 120 });
        await updateBin(adminCtx, 'bin-1', { name: 'Bin A2', capacityTonnes: 120 });
        expect(sanitizePlainText).toHaveBeenCalledWith('Bin A2');
        expect(logEvent).toHaveBeenCalledTimes(1);
    });
});
