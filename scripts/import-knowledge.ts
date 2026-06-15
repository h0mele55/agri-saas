#!/usr/bin/env tsx
/**
 * Seed the Knowledge Base with CC0 growing guides.
 *
 * Content provenance: the crop facts (sowing method, spacing, sun, days to
 * maturity) are modelled on the OpenFarm crop dataset, which is released
 * CC0 / public domain (https://openfarm.cc — "all data is licensed CC0").
 * Public-domain data can be embedded + redistributed freely; attribution
 * is courtesy, recorded in THIRD_PARTY_NOTICES.md and on each article's
 * `source` field.
 *
 * Each guide becomes a PUBLISHED KnowledgeArticle (+ v1 version) in the
 * target tenant, authored by its first active OWNER/ADMIN. Idempotent:
 * re-running upserts by (tenantId, slug) and skips guides already present.
 *
 * Usage:
 *   tsx scripts/import-knowledge.ts                 # first tenant
 *   tsx scripts/import-knowledge.ts --tenant <slug> # a specific tenant
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { sanitizeRichTextHtml } from '../src/lib/security/sanitize';

interface Guide {
    slug: string;
    title: string;
    summary: string;
    category: string;
    /** TipTap-compatible HTML. */
    content: string;
}

/** CC0 growing guides (OpenFarm-modelled crop data). */
export const GROWING_GUIDES: Guide[] = [
    {
        slug: 'growing-guide-tomato',
        title: 'Growing Tomatoes',
        summary: 'Warm-season fruiting crop; transplant after last frost.',
        category: 'Growing Guide',
        content:
            '<h2>Tomatoes</h2><p>Tomatoes are a warm-season crop that needs full sun (6–8 hours).</p>' +
            '<ul><li><strong>Sowing:</strong> start indoors 6–8 weeks before the last frost; transplant out once soil is warm.</li>' +
            '<li><strong>Spacing:</strong> 45–60 cm between plants, 90 cm between rows.</li>' +
            '<li><strong>Days to maturity:</strong> 60–85 days from transplant.</li>' +
            '<li><strong>Water:</strong> deep, even watering; avoid wetting foliage to reduce blight.</li></ul>' +
            '<p>Harvest when fruit is fully coloured and slightly soft.</p>',
    },
    {
        slug: 'growing-guide-lettuce',
        title: 'Growing Lettuce',
        summary: 'Cool-season leafy green; succession-sow for a continuous harvest.',
        category: 'Growing Guide',
        content:
            '<h2>Lettuce</h2><p>A fast, cool-season leafy crop tolerant of partial shade.</p>' +
            '<ul><li><strong>Sowing:</strong> direct-sow shallowly; sow every 2–3 weeks for succession.</li>' +
            '<li><strong>Spacing:</strong> 20–30 cm for heading types, 10 cm for leaf types.</li>' +
            '<li><strong>Days to maturity:</strong> 30–60 days.</li>' +
            '<li><strong>Tips:</strong> bolts in heat — provide afternoon shade in summer.</li></ul>',
    },
    {
        slug: 'growing-guide-carrot',
        title: 'Growing Carrots',
        summary: 'Cool-season root crop; needs loose, stone-free soil.',
        category: 'Growing Guide',
        content:
            '<h2>Carrots</h2><p>Root crop that prefers loose, deep, stone-free soil and full sun.</p>' +
            '<ul><li><strong>Sowing:</strong> direct-sow thinly 1 cm deep; do not transplant.</li>' +
            '<li><strong>Spacing:</strong> thin to 5 cm apart, rows 30 cm.</li>' +
            '<li><strong>Days to maturity:</strong> 70–80 days.</li>' +
            '<li><strong>Tips:</strong> keep soil evenly moist for straight roots; avoid fresh manure.</li></ul>',
    },
    {
        slug: 'growing-guide-potato',
        title: 'Growing Potatoes',
        summary: 'Cool-season tuber; plant seed potatoes and earth up as they grow.',
        category: 'Growing Guide',
        content:
            '<h2>Potatoes</h2><p>Grown from seed potatoes in full sun and well-drained soil.</p>' +
            '<ul><li><strong>Planting:</strong> plant chitted tubers 10–15 cm deep, 30 cm apart.</li>' +
            '<li><strong>Earthing up:</strong> mound soil over shoots to protect tubers from light.</li>' +
            '<li><strong>Days to maturity:</strong> 70–120 days depending on variety.</li>' +
            '<li><strong>Harvest:</strong> earlies when flowers open; maincrop once foliage dies back.</li></ul>',
    },
    {
        slug: 'growing-guide-beans',
        title: 'Growing Bush Beans',
        summary: 'Warm-season legume; fixes nitrogen, sow after frost.',
        category: 'Growing Guide',
        content:
            '<h2>Bush Beans</h2><p>A warm-season legume that fixes nitrogen in the soil.</p>' +
            '<ul><li><strong>Sowing:</strong> direct-sow 3–4 cm deep after the last frost; soil must be warm.</li>' +
            '<li><strong>Spacing:</strong> 10 cm apart, rows 45 cm.</li>' +
            '<li><strong>Days to maturity:</strong> 50–60 days.</li>' +
            '<li><strong>Harvest:</strong> pick pods young and often to keep plants productive.</li></ul>',
    },
    {
        slug: 'growing-guide-winter-squash',
        title: 'Growing Winter Squash',
        summary: 'Warm-season vining crop; needs space, heat, and rich soil.',
        category: 'Growing Guide',
        content:
            '<h2>Winter Squash</h2><p>A sprawling warm-season crop needing rich soil and full sun.</p>' +
            '<ul><li><strong>Sowing:</strong> sow 2–3 cm deep after frost, or start indoors 3 weeks early.</li>' +
            '<li><strong>Spacing:</strong> 90–120 cm between plants — they vine widely.</li>' +
            '<li><strong>Days to maturity:</strong> 80–110 days.</li>' +
            '<li><strong>Harvest:</strong> when rind is hard and stem corky; cure in sun before storing.</li></ul>',
    },
];

export interface ImportKnowledgeResult {
    tenantId: string;
    created: number;
    skipped: number;
}

/** Seed the growing guides into a tenant. Idempotent on (tenantId, slug). */
export async function importKnowledge(
    prisma: PrismaClient,
    opts: { tenantSlug?: string } = {},
): Promise<ImportKnowledgeResult> {
    const tenant = opts.tenantSlug
        ? await prisma.tenant.findUnique({ where: { slug: opts.tenantSlug }, select: { id: true } })
        : await prisma.tenant.findFirst({ where: { deletedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' } });
    if (!tenant) throw new Error(`No tenant found${opts.tenantSlug ? ` for slug "${opts.tenantSlug}"` : ''}`);

    const author = await prisma.tenantMembership.findFirst({
        where: { tenantId: tenant.id, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
        select: { userId: true },
    });
    if (!author) throw new Error(`Tenant ${tenant.id} has no active OWNER/ADMIN to author the guides`);

    let created = 0;
    let skipped = 0;

    for (const guide of GROWING_GUIDES) {
        const existing = await prisma.knowledgeArticle.findUnique({
            where: { tenantId_slug: { tenantId: tenant.id, slug: guide.slug } },
            select: { id: true },
        });
        if (existing) {
            skipped++;
            continue;
        }

        const article = await prisma.knowledgeArticle.create({
            data: {
                tenantId: tenant.id,
                slug: guide.slug,
                title: guide.title,
                summary: guide.summary,
                category: guide.category,
                source: 'OpenFarm (CC0)',
                ownerUserId: author.userId,
                status: 'PUBLISHED',
            },
            select: { id: true },
        });
        const version = await prisma.knowledgeArticleVersion.create({
            data: {
                tenantId: tenant.id,
                articleId: article.id,
                versionNumber: 1,
                contentType: 'HTML',
                contentText: sanitizeRichTextHtml(guide.content),
                changeSummary: 'Imported from OpenFarm CC0 dataset',
                createdById: author.userId,
            },
            select: { id: true },
        });
        await prisma.knowledgeArticle.update({
            where: { id: article.id },
            data: { currentVersionId: version.id },
        });
        created++;
    }

    return { tenantId: tenant.id, created, skipped };
}

async function main(): Promise<number> {
    const tenantIdx = process.argv.indexOf('--tenant');
    const tenantSlug = tenantIdx >= 0 ? process.argv[tenantIdx + 1] : undefined;
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    const prisma = new PrismaClient({ adapter });
    try {
        const res = await importKnowledge(prisma, { tenantSlug });
        console.log(`Knowledge import: tenant ${res.tenantId} — ${res.created} created, ${res.skipped} already present.`);
        return 0;
    } finally {
        await prisma.$disconnect();
    }
}

if (require.main === module) {
    main().then((code) => process.exit(code)).catch((err) => {
        console.error('Knowledge import failed:', err);
        process.exit(1);
    });
}
