/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks/shims. */
/**
 * Unit tests for the DataStream usecase — token minting on create, and
 * the public token-gated ingestion path (verify → tenant-resolve →
 * createMany). The feature-flag 503 lives at the route boundary; here we
 * test the usecase's token gate + reading insertion directly.
 */
import { createHash } from 'crypto';

// ── tenant-scoped CRUD runs through runInTenantContext ──
const mockDb: any = {
    location: { findFirst: jest.fn().mockResolvedValue({ id: 'loc-1' }) },
    dataStream: { create: jest.fn() },
};
jest.mock('@/lib/db-context', () => ({
    runInTenantContext: jest.fn(async (_ctx: any, fn: (db: any) => any) => fn(mockDb)),
}));

// ── global prisma is used by the public ingestion path ──
const globalPrisma: any = {
    dataStream: { findUnique: jest.fn() },
    dataStreamReading: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
};
jest.mock('@/lib/prisma', () => ({
    __esModule: true,
    prisma: globalPrisma,
    default: globalPrisma,
}));

jest.mock('@/lib/audit-context', () => ({
    runWithAuditContext: jest.fn(async (_meta: any, fn: () => any) => fn()),
}));
jest.mock('@/app-layer/events/audit', () => ({ logEvent: jest.fn() }));

import {
    createDataStream,
    ingestReadings,
    DataStreamAccessDenied,
} from '@/app-layer/usecases/data-stream';
import { makeRequestContext } from '../../helpers/make-context';

const ctx = makeRequestContext('ADMIN', { tenantId: 'tenant-1' });

beforeEach(() => jest.clearAllMocks());

describe('createDataStream — token minting', () => {
    it('mints a raw ingest token, stores only its SHA-256 hash, returns raw once', async () => {
        mockDb.dataStream.create.mockResolvedValue({
            id: 'ds-1',
            key: 'leaf-wetness-1',
            name: 'Leaf wetness',
            kind: 'LEAF_WETNESS',
        });

        const result = await createDataStream(ctx, {
            key: 'leaf-wetness-1',
            name: 'Leaf wetness',
            kind: 'LEAF_WETNESS',
        });

        expect(result.ingestToken).toEqual(expect.any(String));
        expect(result.ingestToken.length).toBeGreaterThan(20);

        // The DB write stored the HASH of the returned raw token, never the raw.
        const writtenHash = mockDb.dataStream.create.mock.calls[0][0].data.ingestTokenHash;
        const expectedHash = createHash('sha256').update(result.ingestToken).digest('hex');
        expect(writtenHash).toBe(expectedHash);
        expect(writtenHash).not.toBe(result.ingestToken);
    });
});

describe('ingestReadings — public token-gated path', () => {
    const RAW = 'a'.repeat(40);
    const HASH = createHash('sha256').update(RAW).digest('hex');

    function activeStream(over: Partial<any> = {}) {
        return {
            id: 'ds-1',
            tenantId: 'tenant-1',
            status: 'ACTIVE',
            deletedAt: null,
            ingestTokenHash: HASH,
            unit: 'minutes',
            ...over,
        };
    }
    const readings = [{ recordedAt: '2026-06-15T10:00:00Z', value: 1.5 }];

    it('inserts readings on a valid token, scoped to the stream tenant', async () => {
        globalPrisma.dataStream.findUnique.mockResolvedValue(activeStream());

        const r = await ingestReadings('ds-1', RAW, readings);
        expect(r.inserted).toBe(2);
        const rows = globalPrisma.dataStreamReading.createMany.mock.calls[0][0].data;
        expect(rows[0].tenantId).toBe('tenant-1');
        expect(rows[0].dataStreamId).toBe('ds-1');
    });

    it('rejects a missing/short token (anti-enumeration)', async () => {
        await expect(ingestReadings('ds-1', '', readings)).rejects.toBeInstanceOf(DataStreamAccessDenied);
        await expect(ingestReadings('ds-1', 'short', readings)).rejects.toBeInstanceOf(DataStreamAccessDenied);
        expect(globalPrisma.dataStreamReading.createMany).not.toHaveBeenCalled();
    });

    it('rejects an unknown stream', async () => {
        globalPrisma.dataStream.findUnique.mockResolvedValue(null);
        await expect(ingestReadings('nope', RAW, readings)).rejects.toBeInstanceOf(DataStreamAccessDenied);
    });

    it('rejects a wrong token (hash mismatch)', async () => {
        globalPrisma.dataStream.findUnique.mockResolvedValue(activeStream());
        await expect(ingestReadings('ds-1', 'b'.repeat(40), readings)).rejects.toBeInstanceOf(DataStreamAccessDenied);
        expect(globalPrisma.dataStreamReading.createMany).not.toHaveBeenCalled();
    });

    it('rejects a disabled or deleted stream', async () => {
        globalPrisma.dataStream.findUnique.mockResolvedValue(activeStream({ status: 'DISABLED' }));
        await expect(ingestReadings('ds-1', RAW, readings)).rejects.toBeInstanceOf(DataStreamAccessDenied);

        globalPrisma.dataStream.findUnique.mockResolvedValue(activeStream({ deletedAt: new Date() }));
        await expect(ingestReadings('ds-1', RAW, readings)).rejects.toBeInstanceOf(DataStreamAccessDenied);
    });

    it('rejects a stream with no token minted', async () => {
        globalPrisma.dataStream.findUnique.mockResolvedValue(activeStream({ ingestTokenHash: null }));
        await expect(ingestReadings('ds-1', RAW, readings)).rejects.toBeInstanceOf(DataStreamAccessDenied);
    });
});
