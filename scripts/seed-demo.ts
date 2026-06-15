#!/usr/bin/env tsx
/**
 * End-to-end DEMO seed — the two product personas in one coherent dataset.
 *
 *   1. A STARTUP FARM (simple mode): a single tenant whose
 *      TenantModuleSettings enables only the core ag modules
 *      (JOURNAL / INVENTORY / PLANNING). On login this operator sees a
 *      focused workspace — no certification / risk / vendor chrome.
 *      BillingAccount.plan = FREE (the per-user / per-location caps bite
 *      in SAAS mode; in dev SELFHOSTED everything resolves to ENTERPRISE).
 *
 *   2. A LARGE GRAIN PRODUCER (enterprise): one Organization with several
 *      child farm tenants (hub-and-spoke), each with the full module
 *      surface and BillingAccount.plan = ENTERPRISE. An org admin sees the
 *      portfolio of farms.
 *
 * Both personas get real ag data (location, input stock lot, a journal
 * entry, a farm task, CC0 growing guides) so the core flows work
 * immediately. Idempotent: re-running upserts by slug + skips present rows.
 *
 * Usage:  tsx scripts/seed-demo.ts   (or `npm run seed:demo`)
 */
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import type { RequestContext } from '@/app-layer/types';
import { getPermissionsForRole } from '@/lib/permissions';
import { createTenantWithOwner } from '@/app-layer/usecases/tenant-lifecycle';
import { setEnabledModules } from '@/app-layer/usecases/modules';
import { createLocation } from '@/app-layer/usecases/location';
import { createLot } from '@/app-layer/usecases/inventory';
import { hashForLookup } from '@/lib/security/encryption';
import { SIMPLE_MODE_MODULES, ALL_MODULES } from '@/lib/modules';
import type { ModuleKey } from '@prisma/client';
import { runInTenantContext } from '@/lib/db-context';
import { attachAutoEvidenceFromLogEntry } from '@/app-layer/usecases/auto-evidence';
import { loadAndValidateCatalogFile } from '../prisma/catalog-loader';
import { applyCatalogFile } from '../prisma/catalog-applier';
import { importUnits } from './import-units';
import { importKnowledge } from './import-knowledge';
import * as path from 'path';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }) });

function ownerCtx(tenantId: string, userId: string): RequestContext {
    return {
        requestId: randomUUID(),
        userId,
        tenantId,
        tenantSlug: undefined,
        role: 'OWNER' as Role,
        permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: false, canExport: true },
        appPermissions: getPermissionsForRole('OWNER' as Role),
    };
}

async function upsertOwner(email: string, name: string, pwd: string) {
    return prisma.user.upsert({
        where: { emailHash: hashForLookup(email) },
        update: {},
        create: { email, emailHash: hashForLookup(email), passwordHash: pwd, name },
    });
}

interface FarmSpec {
    slug: string;
    name: string;
    ownerEmail: string;
    ownerName: string;
    modules: readonly ModuleKey[];
    plan: 'FREE' | 'ENTERPRISE';
    organizationId?: string;
    cropProduct: string;
}

/** Create (idempotently) one farm tenant with module settings + ag data. */
async function seedFarm(spec: FarmSpec, pwd: string) {
    const owner = await upsertOwner(spec.ownerEmail, spec.ownerName, pwd);

    let tenant = await prisma.tenant.findUnique({ where: { slug: spec.slug } });
    if (!tenant) {
        const r = await createTenantWithOwner({
            name: spec.name,
            slug: spec.slug,
            ownerEmail: spec.ownerEmail,
            requestId: `seed-demo-${randomUUID()}`,
        });
        tenant = await prisma.tenant.findUnique({ where: { id: r.tenant.id } });
    }
    if (!tenant) throw new Error(`seed-demo: failed to create tenant ${spec.slug}`);

    if (spec.organizationId) {
        await prisma.tenant.update({ where: { id: tenant.id }, data: { organizationId: spec.organizationId } });
    }

    const ctx = ownerCtx(tenant.id, owner.id);

    // Persona differentiator #1 — module settings (drives the visible nav).
    await setEnabledModules(ctx, [...spec.modules]);

    // Persona differentiator #2 — billing plan (caps bite in SAAS mode).
    try {
        await prisma.billingAccount.upsert({
            where: { tenantId: tenant.id },
            update: { plan: spec.plan },
            create: { tenantId: tenant.id, plan: spec.plan },
        });
    } catch {
        /* BillingAccount shape varies by deployment; non-fatal for the demo. */
    }

    // ── Ag data so the core flows work immediately ──
    const litre = await prisma.unit.findUnique({ where: { key: 'l' } });
    const kg = await prisma.unit.findUnique({ where: { key: 'kg' } });

    // Two input items + one harvested-produce item.
    async function ensureItem(name: string, category: 'SEED' | 'FERTILIZER' | 'PESTICIDE' | 'HARVESTED_PRODUCE', unitId?: string) {
        if (!unitId) return null;
        const existing = await prisma.item.findFirst({ where: { tenantId: tenant!.id, name } });
        if (existing) return existing;
        return prisma.item.create({ data: { tenantId: tenant!.id, name, category, defaultUnitId: unitId, createdByUserId: owner.id } });
    }
    const fert = await ensureItem('Liquid Nitrogen 28%', 'FERTILIZER', litre?.id);
    await ensureItem(spec.cropProduct, 'HARVESTED_PRODUCE', kg?.id);

    // Location (a field) — reuses the entitlement-gated usecase.
    let locationId: string | null = null;
    const existingLoc = await prisma.location.findFirst({ where: { tenantId: tenant.id, name: 'Home Field' } });
    if (existingLoc) {
        locationId = existingLoc.id;
    } else {
        try {
            const loc = await createLocation(ctx, { name: 'Home Field', description: 'Demo field block.' });
            locationId = loc.id;
        } catch (e) {
            console.warn(`  ⚠️  ${spec.slug}: location seed skipped:`, e instanceof Error ? e.message : e);
        }
    }

    // An inventory lot with stock (a fertiliser delivery).
    if (fert) {
        const existingLot = await prisma.inventoryLot.findFirst({ where: { tenantId: tenant.id, itemId: fert.id } });
        if (!existingLot) {
            try {
                await createLot(ctx, { itemId: fert.id, lotCode: `N28-${spec.slug}`, locationId, initialQuantity: 1000 });
            } catch (e) {
                console.warn(`  ⚠️  ${spec.slug}: lot seed skipped:`, e instanceof Error ? e.message : e);
            }
        }
    }

    // A journal observation. Direct-prisma (the seed convention) — the
    // createLogEntry usecase is exercised by the integration tests; here we
    // just want the row so the journal list isn't empty.
    const existingEntry = await prisma.logEntry.findFirst({ where: { tenantId: tenant.id } });
    if (!existingEntry) {
        const entry = await prisma.logEntry.create({
            data: {
                tenantId: tenant.id,
                type: 'OBSERVATION',
                status: 'DONE',
                occurredAt: new Date(),
                title: 'Crop emergence looking even across the field',
                notes: '<p>Good establishment after last week\'s rain.</p>',
                createdByUserId: owner.id,
            },
            select: { id: true },
        });
        if (locationId) {
            await prisma.logLocation.create({ data: { tenantId: tenant.id, logEntryId: entry.id, locationId } }).catch(() => {});
        }
    }

    // A farm task assigned to the owner. Direct-prisma (mirrors how the
    // main seed creates tasks) to avoid the createTask side effects
    // (BullMQ assignment-notification enqueue) that hang without Redis.
    const existingTask = await prisma.task.findFirst({ where: { tenantId: tenant.id, type: 'FARM_TASK' } });
    if (!existingTask) {
        const task = await prisma.task.create({
            data: {
                tenantId: tenant.id,
                type: 'FARM_TASK',
                title: 'Scout north field for aphids',
                priority: 'P2',
                status: 'OPEN',
                dueAt: new Date(Date.now() + 3 * 86_400_000),
                createdByUserId: owner.id,
                assigneeUserId: owner.id,
                metadataJson: { farmTaskType: 'SCOUTING', farmTaskCategory: 'PEST_DISEASE' },
            },
            select: { id: true },
        });
        if (locationId) {
            await prisma.taskLink.create({
                data: { tenantId: tenant.id, taskId: task.id, entityType: 'LOCATION', entityId: locationId },
            }).catch(() => {});
        }
    }

    // CC0 growing guides.
    try {
        await importKnowledge(prisma, { tenantSlug: spec.slug });
    } catch (e) {
        console.warn(`  ⚠️  ${spec.slug}: knowledge seed skipped:`, e instanceof Error ? e.message : e);
    }

    console.log(`✅ ${spec.name} (${spec.slug}) — modules: [${spec.modules.join(', ')}], plan: ${spec.plan}, owner: ${spec.ownerEmail}`);
    return { tenant, owner };
}

/**
 * Replicate `installPack`'s tenant-scoped writes for a scheme pack:
 * create one Control per linked ControlTemplate + its
 * ControlRequirementLink rows, so the tenant has Controls mapped to the
 * scheme's requirements (which is what auto-evidence + readiness key on).
 * Direct prisma to avoid the createTask/BullMQ enqueue path; idempotent
 * (skips a control whose code already exists). RLS-safe enough for a seed:
 * every write carries the explicit tenantId.
 */
async function installSchemePackForDemo(tenantId: string, userId: string, packKey: string) {
    const pack = await prisma.frameworkPack.findUnique({
        where: { key: packKey },
        include: {
            templateLinks: { include: { template: { include: { requirementLinks: true } } } },
        },
    });
    if (!pack) {
        console.warn(`  ⚠️  pack ${packKey} not found — scheme catalog import may have failed`);
        return;
    }

    let controlsCreated = 0;
    let mappingsCreated = 0;
    for (const link of pack.templateLinks) {
        const tmpl = link.template;
        let control = await prisma.control.findFirst({ where: { tenantId, code: tmpl.code } });
        if (!control) {
            control = await prisma.control.create({
                data: {
                    tenantId,
                    code: tmpl.code,
                    name: tmpl.title,
                    description: tmpl.description,
                    category: tmpl.category,
                    frequency: tmpl.defaultFrequency,
                    status: 'NOT_STARTED',
                    createdByUserId: userId,
                },
            });
            controlsCreated++;
        }
        for (const rl of tmpl.requirementLinks) {
            await prisma.controlRequirementLink.upsert({
                where: { controlId_requirementId: { controlId: control.id, requirementId: rl.requirementId } },
                create: { tenantId, controlId: control.id, requirementId: rl.requirementId },
                update: {},
            });
            mappingsCreated++;
        }
    }
    console.log(`✅ Installed ${packKey}: ${controlsCreated} controls, ${mappingsCreated} requirement mappings`);
}

/**
 * Create one INPUT_APPLICATION spray LogEntry on the tenant and run the
 * auto-evidence attach so the demo shows farm-record → scheme-evidence.
 * The attach runs inside `runInTenantContext` (it needs a tenant-bound db
 * handle). Idempotent: skips when an auto-evidence row already exists for
 * the tenant (category AUTO_FARM_RECORD).
 */
async function seedSprayAutoEvidence(tenantId: string, tenantSlug: string, userId: string) {
    const already = await prisma.evidence.findFirst({
        where: { tenantId, category: 'AUTO_FARM_RECORD' },
        select: { id: true },
    });
    if (already) {
        console.log('✅ Auto-evidence already present — skipping spray demo');
        return;
    }

    const entry = await prisma.logEntry.create({
        data: {
            tenantId,
            type: 'INPUT_APPLICATION',
            status: 'DONE',
            occurredAt: new Date(),
            title: 'Applied fungicide to North Field block A',
            notes: '<p>Demo spray record — backs the plant-protection control points.</p>',
            createdByUserId: userId,
        },
        select: { id: true },
    });

    const ctx: RequestContext = { ...ownerCtx(tenantId, userId), tenantSlug };
    const { created } = await runInTenantContext(ctx, (db) =>
        attachAutoEvidenceFromLogEntry(db, ctx, entry.id),
    );
    console.log(`✅ Spray record ${entry.id} → ${created} auto-evidence row(s) attached (status SUBMITTED, pending review)`);
}

async function main() {
    console.log('🌱 Seeding the two-persona demo dataset…\n');
    const pwd = await bcrypt.hash(process.env.SEED_PASSWORD || 'password123', 10);

    // Global unit catalog (shared) — needed before any item/lot.
    await importUnits(prisma);

    // ── Persona 1: the startup farmer (simple mode, FREE) ──
    await seedFarm(
        {
            slug: 'green-acres',
            name: 'Green Acres',
            ownerEmail: 'farmer@greenacres.demo',
            ownerName: 'Sam Smallholder',
            modules: SIMPLE_MODE_MODULES,
            plan: 'FREE',
            cropProduct: 'Wheat (grain)',
        },
        pwd,
    );

    // ── Persona 2: the large grain producer (enterprise, hub-and-spoke) ──
    const org = await prisma.organization.upsert({
        where: { slug: 'bigfarm-co' },
        update: {},
        create: { name: 'BigFarm Co', slug: 'bigfarm-co' },
    });
    console.log(`✅ Organization: ${org.name} (${org.slug})`);

    const childFarms: Array<Pick<FarmSpec, 'slug' | 'name' | 'ownerEmail' | 'ownerName' | 'cropProduct'>> = [
        { slug: 'bigfarm-north', name: 'BigFarm — North Estate', ownerEmail: 'north@bigfarm.demo', ownerName: 'Nadia North', cropProduct: 'Wheat (grain)' },
        { slug: 'bigfarm-south', name: 'BigFarm — South Estate', ownerEmail: 'south@bigfarm.demo', ownerName: 'Sven South', cropProduct: 'Barley (grain)' },
        { slug: 'bigfarm-east', name: 'BigFarm — East Estate', ownerEmail: 'east@bigfarm.demo', ownerName: 'Elena East', cropProduct: 'Oilseed Rape' },
    ];
    const seededChildren: Record<string, { tenant: { id: string; slug: string }; owner: { id: string } }> = {};
    for (const farm of childFarms) {
        const res = await seedFarm(
            { ...farm, modules: ALL_MODULES, plan: 'ENTERPRISE', organizationId: org.id },
            pwd,
        );
        seededChildren[farm.slug] = { tenant: { id: res.tenant.id, slug: res.tenant.slug }, owner: { id: res.owner.id } };
    }

    // ── Certification schemes (global AG_SCHEME frameworks) ──
    // Import the two concept-only scheme catalogs (GlobalG.A.P. IFA + EU
    // Organic) through the SAME loader + applier the `schemes:import` CLI
    // uses, so the demo shows real, mappable schemes. Idempotent (the
    // applier upserts on `key`). Concept-only / paraphrased text — no
    // proprietary scheme wording (LICENSE hygiene; each file is marked
    // illustrative).
    const CATALOG_DIR = path.resolve(__dirname, '..', 'prisma', 'catalogs');
    const schemeCatalogs = ['globalgap-ifa-demo.yaml', 'eu-organic-2018-848-demo.yaml'];
    for (const fileName of schemeCatalogs) {
        try {
            const file = loadAndValidateCatalogFile(path.join(CATALOG_DIR, fileName));
            const result = await applyCatalogFile(prisma, file, path.join(CATALOG_DIR, fileName));
            console.log(
                `✅ Certification scheme: ${result.framework.key} (${result.requirements.upserted} requirements, ${result.templates.created} new templates)`,
            );
        } catch (e) {
            console.warn(`  ⚠️  scheme catalog ${fileName} skipped:`, e instanceof Error ? e.message : e);
        }
    }

    // ── Install the GlobalG.A.P. pack into one enterprise farm + show the
    //    spray → auto-evidence chain end-to-end. Direct prisma (Redis-free):
    //    replicate installPack's control + ControlRequirementLink writes so
    //    Controls mapped to the plant-protection requirements exist, then
    //    create one INPUT_APPLICATION spray record and let
    //    attachAutoEvidenceFromLogEntry mint the SUBMITTED scheme evidence.
    const GG_PACK_KEY = 'GLOBALGAP-IFA-DEMO-BASE';
    const north = seededChildren['bigfarm-north'];
    if (north) {
        try {
            await installSchemePackForDemo(north.tenant.id, north.owner.id, GG_PACK_KEY);
            await seedSprayAutoEvidence(north.tenant.id, north.tenant.slug, north.owner.id);
        } catch (e) {
            console.warn('  ⚠️  GlobalG.A.P. demo (pack + auto-evidence) skipped:', e instanceof Error ? e.message : e);
        }
    }

    // Org admin who sees the whole portfolio.
    const orgAdmin = await upsertOwner('admin@bigfarm.demo', 'Olivia OrgAdmin', pwd);
    await prisma.orgMembership.upsert({
        where: { organizationId_userId: { organizationId: org.id, userId: orgAdmin.id } },
        update: {},
        create: { organizationId: org.id, userId: orgAdmin.id, role: 'ORG_ADMIN' },
    });
    // Auto-provision the org admin into each child farm as AUDITOR (portfolio read).
    const orgTenants = await prisma.tenant.findMany({ where: { organizationId: org.id }, select: { id: true } });
    for (const t of orgTenants) {
        await prisma.tenantMembership.upsert({
            where: { tenantId_userId: { tenantId: t.id, userId: orgAdmin.id } },
            update: {},
            create: { tenantId: t.id, userId: orgAdmin.id, role: 'AUDITOR', provisionedByOrgId: org.id },
        });
    }
    console.log(`✅ Org admin admin@bigfarm.demo provisioned across ${orgTenants.length} child farms`);

    console.log('\n🎉 Demo seed complete.');
    console.log('   Startup farmer : farmer@greenacres.demo  → /t/green-acres   (simple mode)');
    console.log('   Enterprise org : admin@bigfarm.demo       → /org/bigfarm-co  (portfolio)');
    console.log('   (password set via SEED_PASSWORD; default "password123")');
}

main()
    .catch((err) => {
        console.error('Demo seed failed:', err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
        // Force exit — a lazily-opened BullMQ/Redis handle from a usecase
        // can keep the event loop alive after the work is done (Redis is
        // absent in dev). The data is committed; exit deterministically.
        process.exit(process.exitCode ?? 0);
    });
