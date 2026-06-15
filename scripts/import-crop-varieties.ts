#!/usr/bin/env tsx
/**
 * Seed the crop-planning catalog (CropType + CropVariety) with common
 * market-garden crops.
 *
 * Content provenance: the agronomic figures below (days to maturity,
 * spacing, seeds-per-gram, germination) are GENERIC public-domain
 * horticultural norms, modelled on the OpenFarm crop dataset — released
 * CC0 / public domain (https://openfarm.cc — "all data is licensed
 * CC0"). Public-domain data is embedded + redistributed freely;
 * `sourceUrn: 'openfarm:cc0'` records provenance on every variety. No
 * proprietary data is copied.
 *
 * Each crop becomes a CropType (+ one representative CropVariety) in the
 * target tenant. Idempotent: CropType upserts on (tenantId, key),
 * CropVariety on (tenantId, cropTypeId, key); re-running skips rows
 * already present.
 *
 * Usage:
 *   tsx scripts/import-crop-varieties.ts                 # first tenant
 *   tsx scripts/import-crop-varieties.ts --tenant <slug> # a specific tenant
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

type Method = 'DIRECT_SOW' | 'TRANSPLANT';

interface SeedVariety {
    cropType: { key: string; name: string; family: string; category: string };
    variety: {
        key: string;
        name: string;
        defaultMethod: Method;
        daysToGermination: number;
        /** Sow → transplant (TRANSPLANT crops). */
        daysToTransplant: number | null;
        daysToMaturity: number;
        harvestWindowDays: number;
        inRowSpacingCm: number;
        betweenRowSpacingCm: number;
        seedsPerGram: number;
        germinationRate: number;
        seedsPerCell: number;
    };
}

/**
 * ~12 common crops with CC0 (OpenFarm-style) agronomic norms. Generic
 * public-domain figures — NOT transcribed from any proprietary source.
 */
export const CROP_VARIETIES: SeedVariety[] = [
    {
        cropType: { key: 'tomato', name: 'Tomato', family: 'Solanaceae', category: 'fruiting' },
        variety: {
            key: 'tomato-standard', name: 'Standard Slicing',
            defaultMethod: 'TRANSPLANT', daysToGermination: 7, daysToTransplant: 42,
            daysToMaturity: 65, harvestWindowDays: 35,
            inRowSpacingCm: 45, betweenRowSpacingCm: 90,
            seedsPerGram: 350, germinationRate: 0.9, seedsPerCell: 1,
        },
    },
    {
        cropType: { key: 'lettuce', name: 'Lettuce', family: 'Asteraceae', category: 'leafy green' },
        variety: {
            key: 'lettuce-leaf', name: 'Leaf Lettuce',
            defaultMethod: 'TRANSPLANT', daysToGermination: 5, daysToTransplant: 28,
            daysToMaturity: 45, harvestWindowDays: 14,
            inRowSpacingCm: 25, betweenRowSpacingCm: 30,
            seedsPerGram: 800, germinationRate: 0.85, seedsPerCell: 1,
        },
    },
    {
        cropType: { key: 'carrot', name: 'Carrot', family: 'Apiaceae', category: 'root' },
        variety: {
            key: 'carrot-nantes', name: 'Nantes',
            defaultMethod: 'DIRECT_SOW', daysToGermination: 14, daysToTransplant: null,
            daysToMaturity: 70, harvestWindowDays: 21,
            inRowSpacingCm: 5, betweenRowSpacingCm: 30,
            seedsPerGram: 750, germinationRate: 0.8, seedsPerCell: 1,
        },
    },
    {
        cropType: { key: 'beet', name: 'Beet', family: 'Amaranthaceae', category: 'root' },
        variety: {
            key: 'beet-detroit', name: 'Detroit Dark Red',
            defaultMethod: 'DIRECT_SOW', daysToGermination: 10, daysToTransplant: null,
            daysToMaturity: 55, harvestWindowDays: 21,
            inRowSpacingCm: 10, betweenRowSpacingCm: 30,
            seedsPerGram: 55, germinationRate: 0.8, seedsPerCell: 1,
        },
    },
    {
        cropType: { key: 'bean', name: 'Bush Bean', family: 'Fabaceae', category: 'legume' },
        variety: {
            key: 'bean-bush', name: 'Bush Snap',
            defaultMethod: 'DIRECT_SOW', daysToGermination: 8, daysToTransplant: null,
            daysToMaturity: 55, harvestWindowDays: 21,
            inRowSpacingCm: 10, betweenRowSpacingCm: 45,
            seedsPerGram: 3, germinationRate: 0.85, seedsPerCell: 1,
        },
    },
    {
        cropType: { key: 'squash', name: 'Summer Squash', family: 'Cucurbitaceae', category: 'fruiting' },
        variety: {
            key: 'squash-zucchini', name: 'Zucchini',
            defaultMethod: 'TRANSPLANT', daysToGermination: 7, daysToTransplant: 21,
            daysToMaturity: 50, harvestWindowDays: 35,
            inRowSpacingCm: 60, betweenRowSpacingCm: 120,
            seedsPerGram: 7, germinationRate: 0.9, seedsPerCell: 1,
        },
    },
    {
        cropType: { key: 'kale', name: 'Kale', family: 'Brassicaceae', category: 'leafy green' },
        variety: {
            key: 'kale-lacinato', name: 'Lacinato',
            defaultMethod: 'TRANSPLANT', daysToGermination: 6, daysToTransplant: 35,
            daysToMaturity: 60, harvestWindowDays: 56,
            inRowSpacingCm: 45, betweenRowSpacingCm: 60,
            seedsPerGram: 300, germinationRate: 0.85, seedsPerCell: 1,
        },
    },
    {
        cropType: { key: 'pepper', name: 'Pepper', family: 'Solanaceae', category: 'fruiting' },
        variety: {
            key: 'pepper-bell', name: 'Bell',
            defaultMethod: 'TRANSPLANT', daysToGermination: 10, daysToTransplant: 56,
            daysToMaturity: 70, harvestWindowDays: 42,
            inRowSpacingCm: 45, betweenRowSpacingCm: 75,
            seedsPerGram: 160, germinationRate: 0.8, seedsPerCell: 1,
        },
    },
    {
        cropType: { key: 'cucumber', name: 'Cucumber', family: 'Cucurbitaceae', category: 'fruiting' },
        variety: {
            key: 'cucumber-slicing', name: 'Slicing',
            defaultMethod: 'TRANSPLANT', daysToGermination: 6, daysToTransplant: 21,
            daysToMaturity: 55, harvestWindowDays: 28,
            inRowSpacingCm: 30, betweenRowSpacingCm: 120,
            seedsPerGram: 35, germinationRate: 0.9, seedsPerCell: 1,
        },
    },
    {
        cropType: { key: 'radish', name: 'Radish', family: 'Brassicaceae', category: 'root' },
        variety: {
            key: 'radish-cherry', name: 'Cherry Belle',
            defaultMethod: 'DIRECT_SOW', daysToGermination: 5, daysToTransplant: null,
            daysToMaturity: 25, harvestWindowDays: 10,
            inRowSpacingCm: 5, betweenRowSpacingCm: 15,
            seedsPerGram: 100, germinationRate: 0.9, seedsPerCell: 1,
        },
    },
    {
        cropType: { key: 'onion', name: 'Onion', family: 'Amaryllidaceae', category: 'allium' },
        variety: {
            key: 'onion-yellow', name: 'Yellow Storage',
            defaultMethod: 'TRANSPLANT', daysToGermination: 10, daysToTransplant: 56,
            daysToMaturity: 100, harvestWindowDays: 14,
            inRowSpacingCm: 10, betweenRowSpacingCm: 30,
            seedsPerGram: 250, germinationRate: 0.75, seedsPerCell: 1,
        },
    },
    {
        cropType: { key: 'basil', name: 'Basil', family: 'Lamiaceae', category: 'herb' },
        variety: {
            key: 'basil-genovese', name: 'Genovese',
            defaultMethod: 'TRANSPLANT', daysToGermination: 7, daysToTransplant: 35,
            daysToMaturity: 50, harvestWindowDays: 56,
            inRowSpacingCm: 25, betweenRowSpacingCm: 30,
            seedsPerGram: 600, germinationRate: 0.85, seedsPerCell: 3,
        },
    },
];

export interface ImportVarietiesResult {
    tenantId: string;
    cropTypesCreated: number;
    varietiesCreated: number;
    skipped: number;
}

/** Seed the crop catalog into a tenant. Idempotent on the natural keys. */
export async function importCropVarieties(
    prisma: PrismaClient,
    opts: { tenantSlug?: string; tenantId?: string } = {},
): Promise<ImportVarietiesResult> {
    const tenant = opts.tenantId
        ? await prisma.tenant.findUnique({ where: { id: opts.tenantId }, select: { id: true } })
        : opts.tenantSlug
            ? await prisma.tenant.findUnique({ where: { slug: opts.tenantSlug }, select: { id: true } })
            : await prisma.tenant.findFirst({ where: { deletedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' } });
    if (!tenant) throw new Error(`No tenant found${opts.tenantSlug ? ` for slug "${opts.tenantSlug}"` : ''}`);

    let cropTypesCreated = 0;
    let varietiesCreated = 0;
    let skipped = 0;

    for (const seed of CROP_VARIETIES) {
        // CropType — upsert on (tenantId, key).
        let cropType = await prisma.cropType.findFirst({
            where: { tenantId: tenant.id, key: seed.cropType.key },
            select: { id: true },
        });
        if (!cropType) {
            cropType = await prisma.cropType.create({
                data: {
                    tenantId: tenant.id,
                    key: seed.cropType.key,
                    name: seed.cropType.name,
                    family: seed.cropType.family,
                    category: seed.cropType.category,
                },
                select: { id: true },
            });
            cropTypesCreated++;
        }

        // CropVariety — upsert on (tenantId, cropTypeId, key).
        const existingVariety = await prisma.cropVariety.findFirst({
            where: { tenantId: tenant.id, cropTypeId: cropType.id, key: seed.variety.key },
            select: { id: true },
        });
        if (existingVariety) {
            skipped++;
            continue;
        }
        await prisma.cropVariety.create({
            data: {
                tenantId: tenant.id,
                cropTypeId: cropType.id,
                key: seed.variety.key,
                name: seed.variety.name,
                defaultMethod: seed.variety.defaultMethod,
                daysToGermination: seed.variety.daysToGermination,
                daysToTransplant: seed.variety.daysToTransplant,
                daysToMaturity: seed.variety.daysToMaturity,
                harvestWindowDays: seed.variety.harvestWindowDays,
                inRowSpacingCm: seed.variety.inRowSpacingCm,
                betweenRowSpacingCm: seed.variety.betweenRowSpacingCm,
                seedsPerGram: seed.variety.seedsPerGram,
                germinationRate: seed.variety.germinationRate,
                seedsPerCell: seed.variety.seedsPerCell,
                sourceUrn: 'openfarm:cc0',
            },
        });
        varietiesCreated++;
    }

    return { tenantId: tenant.id, cropTypesCreated, varietiesCreated, skipped };
}

async function main(): Promise<number> {
    const tenantIdx = process.argv.indexOf('--tenant');
    const tenantSlug = tenantIdx >= 0 ? process.argv[tenantIdx + 1] : undefined;
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter });
    try {
        const res = await importCropVarieties(prisma, { tenantSlug });
        console.log(
            `Crop varieties import: tenant ${res.tenantId} — ${res.cropTypesCreated} crop types, ` +
                `${res.varietiesCreated} varieties created, ${res.skipped} already present.`,
        );
        return 0;
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().then((code) => process.exit(code)).catch((err) => {
        console.error('Crop varieties import failed:', err);
        process.exit(1);
    });
}
