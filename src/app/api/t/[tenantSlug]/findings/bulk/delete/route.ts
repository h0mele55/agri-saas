/**
 * POST /api/t/:slug/findings/bulk/delete
 *
 * Bulk soft-delete findings (the findings table selection action-row).
 * Permission (ADMIN) + tenant isolation are enforced in
 * `bulkDeleteFinding`. Body: `{ findingIds: string[] }`. Returns
 * `{ deleted: n }`.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkDeleteFinding } from '@/app-layer/usecases/finding';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';
import { z } from 'zod';

const BulkDeleteFindingSchema = z.object({
    findingIds: z.array(z.string().min(1)).min(1).max(100),
});

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkDeleteFindingSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkDeleteFinding(ctx, body.findingIds);
            return jsonResponse(result);
        },
    ),
);
