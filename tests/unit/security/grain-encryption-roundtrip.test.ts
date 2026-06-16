/**
 * Unit Test: enterprise-grain field-encryption round-trip.
 *
 * Pins the Epic B manifest contract for the two grain models added by
 * `feat/enterprise-grain`:
 *   - Contract.terms / Contract.pricingNotes
 *   - YieldRecord.valuationNotes
 *
 * Each is a business-content free-text column listed in
 * `ENCRYPTED_FIELDS`. This test proves the Prisma encryption middleware
 * round-trips them: a write payload is encrypted in place (stored as
 * `v2:`/`v1:` ciphertext) and a read result decrypts back to plaintext.
 * The numeric magnitudes (volumeTonnes / pricePerTonne / grossTonnes) are
 * asserted to stay plaintext so the portfolio / yield rollups can SUM them.
 *
 * Mirrors the round-trip assertions in
 * `tests/unit/encryption-middleware.test.ts`.
 */

jest.mock('@/lib/observability/logger', () => ({
    logger: {
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
        debug: jest.fn(),
    },
}));

import { encryptField, isEncryptedValue } from '@/lib/security/encryption';
import { ENCRYPTED_FIELDS, isEncryptedModel } from '@/lib/security/encrypted-fields';
import { _internals, withEncryptionExtension } from '@/lib/db/encryption-middleware';

const NO_DEKS = { primary: null, previous: null } as const;
const { walkWriteArgument, walkReadResult } = _internals;

describe('enterprise-grain — manifest membership', () => {
    it('Contract + YieldRecord are encrypted models with the expected fields', () => {
        expect(isEncryptedModel('Contract')).toBe(true);
        expect(isEncryptedModel('YieldRecord')).toBe(true);
        expect(ENCRYPTED_FIELDS.Contract).toEqual(
            expect.arrayContaining(['terms', 'pricingNotes']),
        );
        expect(ENCRYPTED_FIELDS.YieldRecord).toEqual(
            expect.arrayContaining(['valuationNotes']),
        );
    });
});

describe('Contract — encrypt on write, decrypt on read', () => {
    it('encrypts terms + pricingNotes but leaves numeric magnitudes plaintext', () => {
        const data: Record<string, unknown> = {
            counterparty: 'Acme Grain Traders',
            commodity: 'Wheat',
            terms: 'Forward sale, 500t milling wheat, FOB farm gate, EUR.',
            pricingNotes: 'Basis +12 over the Dec MATIF, locked 2026-05-01.',
            volumeTonnes: 500,
            pricePerTonne: 235.5,
            status: 'ACTIVE',
        };
        walkWriteArgument(data, 'Contract', null);

        // Encrypted free text → ciphertext.
        expect(isEncryptedValue(data.terms as string)).toBe(true);
        expect(isEncryptedValue(data.pricingNotes as string)).toBe(true);
        // Plaintext magnitudes + operational fields untouched.
        expect(data.counterparty).toBe('Acme Grain Traders');
        expect(data.commodity).toBe('Wheat');
        expect(data.volumeTonnes).toBe(500);
        expect(data.pricePerTonne).toBe(235.5);
        expect(data.status).toBe('ACTIVE');
    });

    it('decrypts terms + pricingNotes on read', () => {
        const node: Record<string, unknown> = {
            id: 'c-1',
            terms: encryptField('Full negotiated terms text.'),
            pricingNotes: encryptField('Premium rationale narrative.'),
            counterparty: 'Acme Grain Traders',
            volumeTonnes: 500,
        };
        walkReadResult(node, 'Contract', NO_DEKS);
        expect(node.terms).toBe('Full negotiated terms text.');
        expect(node.pricingNotes).toBe('Premium rationale narrative.');
        expect(node.counterparty).toBe('Acme Grain Traders');
        expect(node.volumeTonnes).toBe(500);
    });

    it('full round trip: write plaintext → ciphertext → read plaintext', () => {
        const terms = 'Confidential: 1,000t malting barley, premium contract.';
        const pricingNotes = 'Spec premium +18 EUR/t on malting grade.';

        // Write side.
        const writeData: Record<string, unknown> = { terms, pricingNotes, volumeTonnes: 1000 };
        walkWriteArgument(writeData, 'Contract', null);
        expect(isEncryptedValue(writeData.terms as string)).toBe(true);
        expect(isEncryptedValue(writeData.pricingNotes as string)).toBe(true);

        // The same ciphertext, read back, decrypts to the original plaintext.
        const readNode: Record<string, unknown> = {
            terms: writeData.terms,
            pricingNotes: writeData.pricingNotes,
            volumeTonnes: writeData.volumeTonnes,
        };
        walkReadResult(readNode, 'Contract', NO_DEKS);
        expect(readNode.terms).toBe(terms);
        expect(readNode.pricingNotes).toBe(pricingNotes);
        expect(readNode.volumeTonnes).toBe(1000);
    });

    it('passes null / empty terms through unchanged', () => {
        const data: Record<string, unknown> = { terms: null, pricingNotes: '' };
        walkWriteArgument(data, 'Contract', null);
        expect(data.terms).toBeNull();
        expect(data.pricingNotes).toBe('');
    });
});

describe('YieldRecord — encrypt on write, decrypt on read', () => {
    it('encrypts valuationNotes but leaves grossTonnes plaintext', () => {
        const data: Record<string, unknown> = {
            commodity: 'Wheat',
            valuationNotes: 'Valued at spot; quality discount for low protein.',
            grossTonnes: 420.75,
            moisturePct: 14.2,
            areaHa: 52,
        };
        walkWriteArgument(data, 'YieldRecord', null);
        expect(isEncryptedValue(data.valuationNotes as string)).toBe(true);
        expect(data.commodity).toBe('Wheat');
        expect(data.grossTonnes).toBe(420.75);
        expect(data.moisturePct).toBe(14.2);
        expect(data.areaHa).toBe(52);
    });

    it('full round trip on valuationNotes', () => {
        const valuationNotes = 'Commercial valuation: held for Q1 carry, expecting +15/t.';
        const writeData: Record<string, unknown> = { valuationNotes, grossTonnes: 420.75 };
        walkWriteArgument(writeData, 'YieldRecord', null);
        expect(isEncryptedValue(writeData.valuationNotes as string)).toBe(true);

        const readNode: Record<string, unknown> = {
            valuationNotes: writeData.valuationNotes,
            grossTonnes: writeData.grossTonnes,
        };
        walkReadResult(readNode, 'YieldRecord', NO_DEKS);
        expect(readNode.valuationNotes).toBe(valuationNotes);
        expect(readNode.grossTonnes).toBe(420.75);
    });
});

describe('grain models — end-to-end through the Prisma extension', () => {
    type Op = (p: {
        model: string;
        operation: string;
        args?: unknown;
        query: (a: unknown) => Promise<unknown>;
    }) => Promise<unknown>;

    function captureHandler(): { handler: Op } {
        const captured: { handler: Op } = {
            handler: (async ({ query, args }) => query(args)) as Op,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fake: any = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            $extends: (cfg: any) => {
                captured.handler = cfg.query.$allModels.$allOperations as Op;
                return fake;
            },
        };
        withEncryptionExtension(fake);
        return captured;
    }

    it('Contract.create stores ciphertext to the DB, returns plaintext to caller', async () => {
        const { handler } = captureHandler();
        let seenDbArgs: unknown;
        const query = jest.fn(async (args: unknown) => {
            seenDbArgs = JSON.parse(JSON.stringify(args));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return JSON.parse(JSON.stringify((args as any).data));
        });

        const terms = 'Negotiated terms — strictly confidential.';
        const result = (await handler({
            model: 'Contract',
            operation: 'create',
            args: { data: { counterparty: 'Buyer Ltd', terms, volumeTonnes: 250 } },
            query,
        })) as { counterparty: string; terms: string; volumeTonnes: number };

        // DB saw ciphertext.
        expect(
            isEncryptedValue((seenDbArgs as { data: { terms: string } }).data.terms),
        ).toBe(true);
        // Caller saw plaintext + plaintext magnitude.
        expect(result.terms).toBe(terms);
        expect(result.volumeTonnes).toBe(250);
    });
});
