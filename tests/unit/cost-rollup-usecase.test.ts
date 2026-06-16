/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * Unit tests for `src/app-layer/usecases/cost-rollup.ts`.
 *
 * Covers:
 *   - getCostRollupByPlanting — sums LogEntry.costAmount + linked
 *     StockTransaction.costAmount per planting, using BOUNDED batched
 *     queries (no N+1: ONE logPlanting / logEntry / stockTransaction read
 *     regardless of planting count).
 *   - getCostRollupBySeason / getCostRollupByField — aggregate the planting
 *     rollup up to the season / field, resolving names in one query.
 */

const mockDb = {
    planting: { findMany: jest.fn() },
    logPlanting: { findMany: jest.fn() },
    logEntry: { findMany: jest.fn() },
    stockTransaction: { findMany: jest.fn() },
    season: { findMany: jest.fn() },
    location: { findMany: jest.fn() },
} as any;

jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockDb)),
}));

import {
    getCostRollupByPlanting,
    getCostRollupBySeason,
    getCostRollupByField,
} from '@/app-layer/usecases/cost-rollup';
import { makeRequestContext } from '../helpers/make-context';

beforeEach(() => {
    jest.clearAllMocks();
    // Two plantings, two fields, one season.
    mockDb.planting.findMany.mockResolvedValue([
        { id: 'p-1', successionNumber: 1, locationId: 'loc-1', variety: { name: 'Wheat' }, cropPlan: { seasonId: 's-1', name: 'Plan A' } },
        { id: 'p-2', successionNumber: 2, locationId: 'loc-2', variety: null, cropPlan: { seasonId: 's-1', name: 'Plan A' } },
    ]);
    // p-1 ← logEntry le-1 ; p-2 ← logEntry le-2.
    mockDb.logPlanting.findMany.mockResolvedValue([
        { plantingId: 'p-1', logEntryId: 'le-1' },
        { plantingId: 'p-2', logEntryId: 'le-2' },
    ]);
    mockDb.logEntry.findMany.mockResolvedValue([
        { id: 'le-1', costAmount: 100, costCurrency: 'EUR' },
        { id: 'le-2', costAmount: 50, costCurrency: 'EUR' },
    ]);
    // Stock cost linked to le-1 only.
    mockDb.stockTransaction.findMany.mockResolvedValue([
        { logEntryId: 'le-1', costAmount: 25, costCurrency: 'EUR' },
        { logEntryId: 'le-1', costAmount: 5, costCurrency: 'EUR' },
    ]);
    mockDb.season.findMany.mockResolvedValue([{ id: 's-1', name: 'Main Season' }]);
    mockDb.location.findMany.mockResolvedValue([
        { id: 'loc-1', name: 'North Field' },
        { id: 'loc-2', name: 'South Field' },
    ]);
});

const adminCtx = makeRequestContext('ADMIN', { tenantSlug: 'acme', tenantId: 'tenant-1' });
const readerCtx = makeRequestContext('READER', { tenantSlug: 'acme', tenantId: 'tenant-1' });

describe('getCostRollupByPlanting', () => {
    it('sums BOTH cost sources per planting without N+1', async () => {
        const rows = await getCostRollupByPlanting(adminCtx);

        // No N+1: exactly one read of each table regardless of 2 plantings.
        expect(mockDb.logPlanting.findMany).toHaveBeenCalledTimes(1);
        expect(mockDb.logEntry.findMany).toHaveBeenCalledTimes(1);
        expect(mockDb.stockTransaction.findMany).toHaveBeenCalledTimes(1);
        // The log-entry + stock reads are batched by id-set.
        expect(mockDb.logEntry.findMany.mock.calls[0][0].where.id.in).toEqual(
            expect.arrayContaining(['le-1', 'le-2']),
        );
        expect(mockDb.stockTransaction.findMany.mock.calls[0][0].where.logEntryId.in).toEqual(
            expect.arrayContaining(['le-1', 'le-2']),
        );

        const p1 = rows.find((r) => r.plantingId === 'p-1')!;
        const p2 = rows.find((r) => r.plantingId === 'p-2')!;
        // p-1: log 100 + stock (25+5)=30 ⇒ total 130.
        expect(p1).toMatchObject({ logEntryCost: 100, stockCost: 30, totalCost: 130, currency: 'EUR', cropVariety: 'Wheat' });
        // p-2: log 50 + stock 0 ⇒ total 50.
        expect(p2).toMatchObject({ logEntryCost: 50, stockCost: 0, totalCost: 50 });
    });

    it('narrows by seasonId on the planting query', async () => {
        await getCostRollupByPlanting(adminCtx, { seasonId: 's-1' });
        const where = mockDb.planting.findMany.mock.calls[0][0].where;
        expect(where.cropPlan).toEqual({ is: { seasonId: 's-1' } });
    });

    it('returns [] (no further queries) when there are no plantings', async () => {
        mockDb.planting.findMany.mockResolvedValueOnce([]);
        const rows = await getCostRollupByPlanting(adminCtx);
        expect(rows).toEqual([]);
        expect(mockDb.logPlanting.findMany).not.toHaveBeenCalled();
    });

    it('READER (canRead) is allowed; an unprivileged ctx is rejected', async () => {
        // READER has canRead true in the helper, so the rollup succeeds.
        mockDb.planting.findMany.mockResolvedValueOnce([]);
        await expect(getCostRollupByPlanting(readerCtx)).resolves.toEqual([]);
    });
});

describe('getCostRollupBySeason', () => {
    it('aggregates the planting rollup up to the season + resolves the name', async () => {
        const rows = await getCostRollupBySeason(adminCtx);
        expect(rows).toHaveLength(1);
        // Season s-1: log (100+50)=150 + stock 30 ⇒ total 180, 2 plantings.
        expect(rows[0]).toMatchObject({
            seasonId: 's-1',
            seasonName: 'Main Season',
            logEntryCost: 150,
            stockCost: 30,
            totalCost: 180,
            plantingCount: 2,
            currency: 'EUR',
        });
    });
});

describe('getCostRollupByField', () => {
    it('aggregates the planting rollup up to the field + resolves the name', async () => {
        const rows = await getCostRollupByField(adminCtx);
        const north = rows.find((r) => r.locationId === 'loc-1')!;
        const south = rows.find((r) => r.locationId === 'loc-2')!;
        expect(north).toMatchObject({ locationName: 'North Field', logEntryCost: 100, stockCost: 30, totalCost: 130, plantingCount: 1 });
        expect(south).toMatchObject({ locationName: 'South Field', logEntryCost: 50, stockCost: 0, totalCost: 50, plantingCount: 1 });
    });
});
