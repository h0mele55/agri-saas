/**
 * Knowledge Base — DB-backed integration tests.
 *
 * Coverage
 * --------
 *   1. The DRAFT → PUBLISH → ACKNOWLEDGE lifecycle, mirroring Policy:
 *      createArticle (DRAFT + v1), publishArticle (PUBLISHED), worker
 *      acknowledgeArticle (idempotent on the version+user unique).
 *   2. A new version rolls a PUBLISHED article back to DRAFT.
 *   3. Acknowledging a non-PUBLISHED article is rejected.
 *   4. listAcknowledgements reports who acknowledged.
 *   5. HTML content is sanitised on write (a <script> is stripped).
 *   6. The article is discoverable via the unified search surface.
 */

import { PrismaClient, Role, MembershipStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { randomUUID } from 'crypto';
import { DB_URL, DB_AVAILABLE } from './db-helper';
import { hashForLookup } from '@/lib/security/encryption';
import { makeRequestContext } from '../helpers/make-context';
import {
    createArticle,
    createArticleVersion,
    publishArticle,
    acknowledgeArticle,
    listAcknowledgements,
    getArticle,
    listArticles,
    listCategories,
} from '@/app-layer/usecases/knowledge';
import { getUnifiedSearch } from '@/app-layer/usecases/search';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: DB_URL }) });
const describeFn = DB_AVAILABLE ? describe : describe.skip;

const TAG = `kb-${randomUUID().slice(0, 8)}`;
const TENANT_ID = `t-${TAG}`;

let ownerId = '';
let workerId = '';

beforeAll(async () => {
    if (!DB_AVAILABLE) return;
    await prisma.$connect();
    await prisma.tenant.upsert({ where: { id: TENANT_ID }, update: {}, create: { id: TENANT_ID, name: TENANT_ID, slug: TAG } });
    for (const label of ['owner', 'worker']) {
        const email = `${TAG}-${label}@example.test`;
        const u = await prisma.user.create({ data: { email, emailHash: hashForLookup(email) } });
        if (label === 'owner') ownerId = u.id;
        else workerId = u.id;
    }
    await prisma.tenantMembership.createMany({
        data: [
            { tenantId: TENANT_ID, userId: ownerId, role: Role.OWNER, status: MembershipStatus.ACTIVE },
            { tenantId: TENANT_ID, userId: workerId, role: Role.EDITOR, status: MembershipStatus.ACTIVE },
        ],
    });
});

afterAll(async () => {
    if (!DB_AVAILABLE) return;
    try {
        await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
            await tx.$executeRawUnsafe(`DELETE FROM "KnowledgeAcknowledgement" WHERE "tenantId" = $1`, TENANT_ID);
            await tx.$executeRawUnsafe(`DELETE FROM "KnowledgeArticleVersion" WHERE "tenantId" = $1`, TENANT_ID);
            await tx.$executeRawUnsafe(`DELETE FROM "KnowledgeArticle" WHERE "tenantId" = $1`, TENANT_ID);
        });
    } catch {
        /* globalSetup handles reset */
    }
    await prisma.$disconnect();
});

const ownerCtx = () => makeRequestContext('OWNER', { userId: ownerId, tenantId: TENANT_ID, tenantSlug: TAG });
const workerCtx = () => makeRequestContext('EDITOR', { userId: workerId, tenantId: TENANT_ID, tenantSlug: TAG });

describeFn('knowledge base (DB)', () => {
    let articleId = '';
    let versionId = '';

    test('createArticle drafts an article + v1, sanitising HTML content', async () => {
        const article = await createArticle(ownerCtx(), {
            title: `Spray Safety SOP ${TAG}`,
            category: 'Safety',
            summary: 'How to spray safely',
            contentType: 'HTML',
            content: '<p>Wear PPE.</p><script>alert(1)</script>',
        });
        articleId = article.id;

        const detail = await getArticle(ownerCtx(), articleId);
        expect(detail.status).toBe('DRAFT');
        expect(detail.versions).toHaveLength(1);
        expect(detail.currentVersionId).toBeTruthy();
        expect(detail.acknowledged).toBe(false);
        versionId = detail.currentVersionId!;

        // <script> stripped on write; the paragraph survives.
        const version = detail.versions[0];
        expect(version.contentText).toContain('Wear PPE');
        expect(version.contentText).not.toContain('<script');
    });

    test('acknowledging a DRAFT article is rejected', async () => {
        await expect(acknowledgeArticle(workerCtx(), articleId)).rejects.toThrow(/Only PUBLISHED/);
    });

    test('publish → worker acknowledges (idempotent) → admin sees the receipt', async () => {
        await publishArticle(ownerCtx(), articleId, versionId);
        const published = await getArticle(ownerCtx(), articleId);
        expect(published.status).toBe('PUBLISHED');

        const first = await acknowledgeArticle(workerCtx(), articleId);
        expect(first.created).toBe(true);
        const second = await acknowledgeArticle(workerCtx(), articleId);
        expect(second.created).toBe(false); // idempotent on (version, user)

        const acks = await listAcknowledgements(ownerCtx(), articleId);
        expect(acks.map((a) => a.user.id)).toContain(workerId);

        // The worker now sees their own acknowledgement on the detail.
        const asWorker = await getArticle(workerCtx(), articleId);
        expect(asWorker.acknowledged).toBe(true);
    });

    test('a new version rolls the article back to DRAFT', async () => {
        await createArticleVersion(ownerCtx(), articleId, {
            contentType: 'HTML',
            contentText: '<p>Updated PPE guidance.</p>',
            changeSummary: 'PPE update',
        });
        const detail = await getArticle(ownerCtx(), articleId);
        expect(detail.status).toBe('DRAFT');
        expect(detail.versions.length).toBe(2);
    });

    test('list + categories surface the article', async () => {
        const list = await listArticles(ownerCtx());
        expect(list.map((a) => a.id)).toContain(articleId);
        const cats = await listCategories(ownerCtx());
        expect(cats).toContain('Safety');
    });

    test('the article is discoverable via the unified search surface', async () => {
        const res = await getUnifiedSearch(ownerCtx(), `Spray Safety SOP ${TAG}`);
        const hit = res.hits.find((h) => h.type === 'knowledge' && h.id === articleId);
        expect(hit).toBeDefined();
        expect(hit!.href).toContain(`/knowledge/${articleId}`);
    });
});
