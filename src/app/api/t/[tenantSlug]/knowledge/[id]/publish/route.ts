import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { publishArticle } from '@/app-layer/usecases/knowledge';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

const PublishKnowledgeSchema = z.object({ versionId: z.string().min(1, 'versionId is required') }).strip();

export const POST = withApiErrorHandling(
    withValidatedBody(
        PublishKnowledgeSchema,
        async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }, body) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const article = await publishArticle(ctx, params.id, body.versionId);
            return jsonResponse(article);
        },
    ),
);
