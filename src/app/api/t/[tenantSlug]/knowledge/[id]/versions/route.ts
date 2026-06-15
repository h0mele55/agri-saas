import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { createArticleVersion } from '@/app-layer/usecases/knowledge';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

const CreateKnowledgeVersionSchema = z
    .object({
        contentType: z.enum(['HTML', 'MARKDOWN']).default('HTML'),
        contentText: z.string().min(1, 'Content is required').max(100000),
        changeSummary: z.string().max(500).nullable().optional(),
    })
    .strip();

export const POST = withApiErrorHandling(
    withValidatedBody(
        CreateKnowledgeVersionSchema,
        async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }, body) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const version = await createArticleVersion(ctx, params.id, body);
            return jsonResponse(version, { status: 201 });
        },
    ),
);
