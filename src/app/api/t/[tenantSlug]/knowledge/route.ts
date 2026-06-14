import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { listArticles, createArticle } from '@/app-layer/usecases/knowledge';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';
import { normalizeQ } from '@/lib/filters/query-helpers';

const QuerySchema = z
    .object({
        status: z.string().optional(),
        category: z.string().optional(),
        q: z.string().optional().transform(normalizeQ),
    })
    .strip();

const CreateKnowledgeArticleSchema = z
    .object({
        title: z.string().min(1, 'Title is required').max(500),
        summary: z.string().max(2000).nullable().optional(),
        category: z.string().max(120).nullable().optional(),
        ownerUserId: z.string().nullable().optional(),
        language: z.string().max(8).nullable().optional(),
        source: z.string().max(120).nullable().optional(),
        contentType: z.enum(['HTML', 'MARKDOWN']).optional(),
        content: z.string().max(100000).nullable().optional(),
    })
    .strip();

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const query = QuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
        const articles = await listArticles(ctx, { status: query.status, category: query.category, q: query.q });
        return jsonResponse(articles);
    },
);

export const POST = withApiErrorHandling(
    withValidatedBody(
        CreateKnowledgeArticleSchema,
        async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const article = await createArticle(ctx, body);
            return jsonResponse(article, { status: 201 });
        },
    ),
);
