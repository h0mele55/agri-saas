/**
 * `npm run seed:farm` — demo FARM tenant (the ag-first replacement for
 * the compliance demo).
 *
 * Creates an idempotent demo tenant ("Green Acres Farm") via the same
 * `createTenantWithOwner` path the platform-admin API uses, then seeds:
 *   • the global UOM catalog (delegates to `importUnits`),
 *   • one demo Location ("North Field"),
 *   • a minimal input-product `Item` catalog (the spray products /
 *     fertiliser / seed a farmer reaches for first).
 *
 * The tenant carries NO `TenantModuleSettings` row, so it resolves to the
 * Phase-0 ag-first default (every module EXCEPT CERTIFICATION) — i.e. it
 * shows only ag/shared nav until an admin flips CERTIFICATION on.
 *
 *   set -a && . ./.env && set +a && npx tsx scripts/seed-demo-farm.ts
 *
 * Idempotent: safe to re-run against an existing dev DB.
 * Licensing: generic demo data — nothing third-party copied.
 */
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { createTenantWithOwner } from '@/app-layer/usecases/tenant-lifecycle';
import { importUnits } from './import-units';
import type { ItemCategory } from '@prisma/client';

const DEMO_SLUG = 'green-acres-farm';
const DEMO_NAME = 'Green Acres Farm';
const DEMO_OWNER = 'farmer@greenacres.example';

interface InputProductSeed {
    name: string;
    category: ItemCategory;
    /** `Unit.key` for the product's default unit (must exist post import-units). */
    unitKey: string;
    sku: string;
}

const INPUT_PRODUCTS: InputProductSeed[] = [
    { name: 'Glyphosate 360', category: 'PESTICIDE', unitKey: 'l', sku: 'HRB-GLY-360' },
    { name: 'Urea 46-0-0', category: 'FERTILIZER', unitKey: 'kg', sku: 'FRT-UREA-46' },
    { name: 'Spring Wheat Seed', category: 'SEED', unitKey: 'kg', sku: 'SED-WHT-SPR' },
];

async function main(): Promise<void> {
    // 1. Units first — Item.defaultUnitId FK requires them.
    await importUnits(prisma);

    // 2. Demo farm tenant — idempotent by slug (same path as the
    //    platform-admin POST /api/admin/tenants route).
    let tenant = await prisma.tenant.findUnique({ where: { slug: DEMO_SLUG } });
    if (!tenant) {
        const result = await createTenantWithOwner({
            name: DEMO_NAME,
            slug: DEMO_SLUG,
            ownerEmail: DEMO_OWNER,
            requestId: `seed-farm-${randomUUID()}`,
        });
        tenant = await prisma.tenant.findUnique({ where: { id: result.tenant.id } });
    }
    if (!tenant) throw new Error('seed-demo-farm: failed to create or load the demo farm tenant');

    // 3. Demo Location — idempotent by [tenantId, key].
    await prisma.location.upsert({
        where: { tenantId_key: { tenantId: tenant.id, key: 'north-field' } },
        update: {},
        create: {
            tenantId: tenant.id,
            key: 'north-field',
            name: 'North Field',
            description: 'Demo field block — upload a boundary file to draw parcels.',
            status: 'ACTIVE',
        },
    });

    // 4. Minimal input-product catalog (tenant-scoped Items).
    let created = 0;
    for (const p of INPUT_PRODUCTS) {
        const unit = await prisma.unit.findUnique({ where: { key: p.unitKey } });
        if (!unit) {
            console.warn(`[seed-demo-farm] unit '${p.unitKey}' not found — skipping ${p.name}`);
            continue;
        }
        const existing = await prisma.item.findFirst({
            where: { tenantId: tenant.id, name: p.name },
            select: { id: true },
        });
        if (!existing) {
            await prisma.item.create({
                data: {
                    tenantId: tenant.id,
                    name: p.name,
                    category: p.category,
                    sku: p.sku,
                    defaultUnitId: unit.id,
                },
            });
            created += 1;
        }
    }

    console.log(
        `[seed-demo-farm] '${DEMO_SLUG}' ready — owner ${DEMO_OWNER}, ` +
            `1 location, ${created} new input product(s). ` +
            `Modules: ag-first default (CERTIFICATION off until enabled).`,
    );
    await prisma.$disconnect();
}

main().catch((err) => {
    console.error('[seed-demo-farm] failed:', err);
    process.exit(1);
});
