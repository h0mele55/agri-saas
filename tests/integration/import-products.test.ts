/**
 * `importProducts` — DB-backed integration test.
 *
 * Mirrors the importer-test convention:
 *   • the generic product catalog seeds Item rows of category
 *     PESTICIDE / FERTILIZER / AMENDMENT into a fresh tenant, every row
 *     carrying `attributesJson.activeIngredient` and a real
 *     `defaultUnitId` (resolved from the global Unit catalog);
 *   • a SECOND run is fully idempotent (created = 0, skipped > 0) — the
 *     Item (tenantId, sku) guard re-skips every row.
 *
 * The Item / Unit tables are NOT truncated by resetDatabase(); the test
 * scopes every assertion to its own tagged tenant (Items) and to the
 * importer's stable `PROD-*` skus, and tears the tenant-scoped rows down
 * in afterAll. Units are a shared global catalog — left intact.
 *
 * Skipped when DB is unavailable.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { DB_URL, DB_AVAILABLE } from './db-helper';
import { importProducts, PRODUCT_SEEDS } from '../../scripts/import-products';
import { importUnits } from '../../scripts/import-units';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
const describeFn = DB_AVAILABLE ? describe : describe.skip;

const TAG = `prod-${randomUUID().slice(0, 8)}`;
const TENANT_ID = `t-${TAG}`;

beforeAll(async () => {
    if (!DB_AVAILABLE) return;
    await prisma.$connect();
    // The importer resolves units 'l' / 'kg' from the global catalog and
    // seeds them if missing; pre-seed here so the assertions are stable.
    await importUnits(prisma);
    await prisma.tenant.upsert({
        where: { id: TENANT_ID },
        update: {},
        create: { id: TENANT_ID, name: TENANT_ID, slug: TAG },
    });
});

afterAll(async () => {
    if (!DB_AVAILABLE) return;
    try {
        await prisma.item.deleteMany({ where: { tenantId: TENANT_ID } });
        await prisma.tenant.delete({ where: { id: TENANT_ID } });
    } catch {
        /* globalSetup handles reset */
    }
    await prisma.$disconnect();
});

describeFn('importProducts (DB)', () => {
    test('the catalog source is sized + sku-unique', () => {
        expect(PRODUCT_SEEDS.length).toBeGreaterThanOrEqual(15);
        const skus = PRODUCT_SEEDS.map((p) => p.sku);
        expect(new Set(skus).size).toBe(skus.length);
        // Spans the three input categories.
        const cats = new Set(PRODUCT_SEEDS.map((p) => p.category));
        expect(cats.has('PESTICIDE')).toBe(true);
        expect(cats.has('FERTILIZER')).toBe(true);
        expect(cats.has('AMENDMENT')).toBe(true);
        // Every seed carries a generic active ingredient.
        for (const p of PRODUCT_SEEDS) {
            expect(p.attributes.activeIngredient.length).toBeGreaterThan(0);
        }
    });

    test('first run seeds the product catalog into the tenant', async () => {
        const res = await importProducts(prisma, { tenantId: TENANT_ID });

        expect(res.tenantId).toBe(TENANT_ID);
        expect(res.created).toBe(PRODUCT_SEEDS.length);
        expect(res.skipped).toBe(0);

        const items = await prisma.item.count({ where: { tenantId: TENANT_ID } });
        expect(items).toBe(PRODUCT_SEEDS.length);
    });

    test('PESTICIDE + FERTILIZER items persist with activeIngredient + a real unit', async () => {
        const pesticides = await prisma.item.findMany({
            where: { tenantId: TENANT_ID, category: 'PESTICIDE' },
            select: { name: true, sku: true, defaultUnitId: true, attributesJson: true },
        });
        const fertilizers = await prisma.item.findMany({
            where: { tenantId: TENANT_ID, category: 'FERTILIZER' },
            select: { sku: true, attributesJson: true },
        });

        expect(pesticides.length).toBeGreaterThan(0);
        expect(fertilizers.length).toBeGreaterThan(0);

        for (const p of pesticides) {
            const attrs = p.attributesJson as Record<string, unknown> | null;
            expect(attrs).not.toBeNull();
            expect(typeof attrs!.activeIngredient).toBe('string');
            expect((attrs!.activeIngredient as string).length).toBeGreaterThan(0);
            // defaultUnitId is a real FK — the row joins to a Unit.
            expect(p.defaultUnitId).toBeTruthy();
        }

        // A fertilizer row carries its NPK guaranteed analysis.
        const ammoniumNitrate = fertilizers.find((f) => f.sku === 'PROD-AN-34-0-0');
        expect(ammoniumNitrate).toBeTruthy();
        const anAttrs = ammoniumNitrate!.attributesJson as Record<string, unknown>;
        expect(anAttrs.npk).toBe('34-0-0');
        expect(anAttrs.activeIngredient).toBe('Ammonium nitrate');

        // The defaultUnitId actually resolves to a Unit row.
        const unit = await prisma.unit.findUnique({ where: { id: pesticides[0].defaultUnitId } });
        expect(unit).not.toBeNull();
    });

    test('second run is fully idempotent', async () => {
        const before = await prisma.item.count({ where: { tenantId: TENANT_ID } });

        const res = await importProducts(prisma, { tenantId: TENANT_ID });
        expect(res.created).toBe(0);
        expect(res.skipped).toBe(PRODUCT_SEEDS.length);

        const after = await prisma.item.count({ where: { tenantId: TENANT_ID } });
        expect(after).toBe(before);
    });
});
