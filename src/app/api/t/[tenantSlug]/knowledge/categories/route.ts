import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listCategories } from '@/app-layer/usecases/knowledge';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** Distinct categories for the knowledge-base browse/filter UI. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const categories = await listCategories(ctx);
        return jsonResponse(categories);
    },
);
