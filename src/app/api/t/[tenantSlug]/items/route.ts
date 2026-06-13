import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listItems } from '@/app-layer/usecases/catalog';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { z } from 'zod';
import { normalizeQ } from '@/lib/filters/query-helpers';

const ItemQuerySchema = z.object({
    category: z.string().optional(),
    q: z.string().optional().transform(normalizeQ),
}).strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const query = ItemQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    const items = await listItems(ctx, { category: query.category, q: query.q });
    return jsonResponse(items);
});
