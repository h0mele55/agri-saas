/* eslint-disable @typescript-eslint/no-explicit-any -- standard
 * test-mock pattern; per-line typing has poor cost/benefit ratio. */

/**
 * Unit tests for `src/app-layer/usecases/contract.ts`.
 *
 * Covers:
 *   - listContracts — read gate + tenantId/deletedAt filter + filter folding.
 *   - createContract — sanitises counterparty/commodity/terms/pricingNotes,
 *     audits, validates non-empty counterparty + non-negative volume + dates.
 *   - updateContract / deleteContract — notFound + soft-delete + audit.
 *   - RBAC: a READER cannot write.
 */

const mockDb = {
    contract: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    season: { findFirst: jest.fn() },
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
import {
    listContracts,
    getContract,
    createContract,
    updateContract,
    deleteContract,
} from '@/app-layer/usecases/contract';
import { makeRequestContext } from '../helpers/make-context';

beforeEach(() => {
    jest.clearAllMocks();
});

const adminCtx = makeRequestContext('ADMIN', { tenantSlug: 'acme', tenantId: 'tenant-1', userId: 'user-1' });
const readerCtx = makeRequestContext('READER', { tenantSlug: 'acme', tenantId: 'tenant-1' });

describe('listContracts', () => {
    it('reads tenant-scoped + non-deleted with filters folded in', async () => {
        mockDb.contract.findMany.mockResolvedValue([{ id: 'c-1' }]);
        const out = await listContracts(adminCtx, { status: 'ACTIVE', type: 'SALE', seasonId: 's-1' });
        expect(out).toEqual([{ id: 'c-1' }]);
        const args = mockDb.contract.findMany.mock.calls[0][0];
        expect(args.where).toMatchObject({
            tenantId: 'tenant-1',
            deletedAt: null,
            status: 'ACTIVE',
            type: 'SALE',
            seasonId: 's-1',
        });
        expect(args.take).toBe(500);
    });

    it('omits absent filters', async () => {
        mockDb.contract.findMany.mockResolvedValue([]);
        await listContracts(adminCtx, {});
        const args = mockDb.contract.findMany.mock.calls[0][0];
        expect(args.where).toEqual({ tenantId: 'tenant-1', deletedAt: null });
    });
});

describe('createContract', () => {
    it('sanitises free text + audits + defaults type/status', async () => {
        mockDb.contract.create.mockResolvedValue({
            id: 'c-1',
            type: 'SALE',
            status: 'DRAFT',
            counterparty: 'SAN::Acme',
        });
        await createContract(adminCtx, {
            counterparty: 'Acme',
            commodity: 'Wheat',
            terms: 'secret terms',
            pricingNotes: 'basis note',
            volumeTonnes: 500,
        });

        // Every free-text field routed through the sanitiser.
        expect(sanitizePlainText).toHaveBeenCalledWith('Acme');
        expect(sanitizePlainText).toHaveBeenCalledWith('Wheat');
        expect(sanitizePlainText).toHaveBeenCalledWith('secret terms');
        expect(sanitizePlainText).toHaveBeenCalledWith('basis note');

        const data = mockDb.contract.create.mock.calls[0][0].data;
        expect(data).toMatchObject({
            tenantId: 'tenant-1',
            counterparty: 'SAN::Acme',
            commodity: 'SAN::Wheat',
            terms: 'SAN::secret terms',
            pricingNotes: 'SAN::basis note',
            type: 'SALE',
            status: 'DRAFT',
            volumeTonnes: 500,
        });

        expect(logEvent).toHaveBeenCalledTimes(1);
        const payload = (logEvent as jest.Mock).mock.calls[0][2];
        expect(payload.entityType).toBe('Contract');
        expect(payload.detailsJson.category).toBe('entity_lifecycle');
        expect(payload.detailsJson.operation).toBe('created');
    });

    it('rejects an empty counterparty (after sanitise)', async () => {
        (sanitizePlainText as jest.Mock).mockReturnValueOnce(''); // counterparty → empty
        await expect(createContract(adminCtx, { counterparty: '   ' } as any)).rejects.toThrow(
            /counterparty is required/i,
        );
        expect(mockDb.contract.create).not.toHaveBeenCalled();
    });

    it('rejects a negative volume', async () => {
        await expect(
            createContract(adminCtx, { counterparty: 'Acme', volumeTonnes: -1 }),
        ).rejects.toThrow(/zero or positive/i);
    });

    it('rejects delivery end before start', async () => {
        await expect(
            createContract(adminCtx, {
                counterparty: 'Acme',
                deliveryStart: '2026-06-01',
                deliveryEnd: '2026-05-01',
            }),
        ).rejects.toThrow(/on or after/i);
    });

    it('validates the season belongs to the tenant', async () => {
        mockDb.season.findFirst.mockResolvedValue(null);
        await expect(
            createContract(adminCtx, { counterparty: 'Acme', seasonId: 'foreign' }),
        ).rejects.toThrow(/Season not found/i);
    });

    it('READER cannot create', async () => {
        await expect(createContract(readerCtx, { counterparty: 'Acme' })).rejects.toThrow();
        expect(mockDb.contract.create).not.toHaveBeenCalled();
    });
});

describe('updateContract', () => {
    it('throws notFound when the contract is missing', async () => {
        mockDb.contract.findFirst.mockResolvedValue(null);
        await expect(updateContract(adminCtx, 'missing', { status: 'ACTIVE' })).rejects.toThrow(/not found/i);
    });

    it('updates + audits with changedFields', async () => {
        mockDb.contract.findFirst.mockResolvedValue({ id: 'c-1' });
        mockDb.contract.update.mockResolvedValue({ id: 'c-1', counterparty: 'SAN::New', status: 'ACTIVE' });
        await updateContract(adminCtx, 'c-1', { counterparty: 'New', status: 'ACTIVE' });
        expect(sanitizePlainText).toHaveBeenCalledWith('New');
        const payload = (logEvent as jest.Mock).mock.calls[0][2];
        expect(payload.detailsJson.changedFields).toEqual(expect.arrayContaining(['counterparty', 'status']));
    });
});

describe('deleteContract', () => {
    it('soft-deletes (sets deletedAt + deletedByUserId) + audits', async () => {
        mockDb.contract.findFirst.mockResolvedValue({ id: 'c-1', counterparty: 'Acme' });
        mockDb.contract.update.mockResolvedValue({ id: 'c-1' });
        const res = await deleteContract(adminCtx, 'c-1');
        expect(res).toEqual({ id: 'c-1', deleted: true });
        const data = mockDb.contract.update.mock.calls[0][0].data;
        expect(data.deletedAt).toBeInstanceOf(Date);
        expect(data.deletedByUserId).toBe('user-1');
        const payload = (logEvent as jest.Mock).mock.calls[0][2];
        expect(payload.detailsJson.operation).toBe('deleted');
    });

    it('throws notFound when missing', async () => {
        mockDb.contract.findFirst.mockResolvedValue(null);
        await expect(deleteContract(adminCtx, 'missing')).rejects.toThrow(/not found/i);
    });
});

describe('getContract', () => {
    it('throws notFound when missing', async () => {
        mockDb.contract.findFirst.mockResolvedValue(null);
        await expect(getContract(adminCtx, 'missing')).rejects.toThrow(/not found/i);
    });
});
