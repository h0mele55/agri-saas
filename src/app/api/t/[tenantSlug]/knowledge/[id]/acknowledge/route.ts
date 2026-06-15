import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { acknowledgeArticle } from '@/app-layer/usecases/knowledge';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** A worker acknowledges the published article's current version (read-receipt). */
export const POST = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const result = await acknowledgeArticle(ctx, params.id);
        return jsonResponse(result, { status: result.created ? 201 : 200 });
    },
);
