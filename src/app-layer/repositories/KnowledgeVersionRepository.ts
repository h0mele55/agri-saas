import { PrismaTx } from '@/lib/db-context';
import { RequestContext } from '../types';
import { KnowledgeContentType } from '@prisma/client';

/**
 * KnowledgeArticleVersion repository — mirrors PolicyVersionRepository.
 * Versions are immutable content snapshots; a new edit creates a new
 * version (versionNumber auto-incremented). All reads/writes are
 * tenant-scoped (RLS-bound + explicit tenantId).
 */
export class KnowledgeVersionRepository {
    static async create(
        db: PrismaTx,
        ctx: RequestContext,
        articleId: string,
        data: { contentType: string; contentText?: string | null; changeSummary?: string | null },
    ) {
        const latest = await db.knowledgeArticleVersion.findFirst({
            where: { articleId, tenantId: ctx.tenantId },
            orderBy: { versionNumber: 'desc' },
            select: { versionNumber: true },
        });
        const nextVersion = (latest?.versionNumber ?? 0) + 1;

        return db.knowledgeArticleVersion.create({
            data: {
                tenantId: ctx.tenantId,
                articleId,
                versionNumber: nextVersion,
                contentType: (data.contentType as KnowledgeContentType) ?? 'HTML',
                contentText: data.contentText ?? null,
                changeSummary: data.changeSummary ?? null,
                createdById: ctx.userId,
            },
            include: { createdBy: { select: { id: true, name: true } } },
        });
    }

    /** All versions of an article, newest first, with ack counts. */
    static async listByArticle(db: PrismaTx, ctx: RequestContext, articleId: string) {
        return db.knowledgeArticleVersion.findMany({
            where: { articleId, tenantId: ctx.tenantId },
            orderBy: { versionNumber: 'desc' },
            include: {
                createdBy: { select: { id: true, name: true } },
                _count: { select: { acknowledgements: true } },
            },
            take: 100,
        });
    }

    static async getById(db: PrismaTx, ctx: RequestContext, id: string) {
        return db.knowledgeArticleVersion.findFirst({
            where: { id, tenantId: ctx.tenantId },
            include: {
                article: { select: { id: true, tenantId: true, title: true } },
                createdBy: { select: { id: true, name: true } },
            },
        });
    }
}
