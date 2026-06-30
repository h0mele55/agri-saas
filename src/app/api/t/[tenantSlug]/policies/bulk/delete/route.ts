/**
 * POST /api/t/:slug/policies/bulk/delete
 *
 * Bulk soft-delete policies (the policies table selection action-row).
 * Permission (ADMIN) + tenant isolation are enforced in `bulkDeletePolicy`.
 * Body: `{ policyIds: string[] }`. Returns `{ deleted: n }`.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkDeletePolicy } from '@/app-layer/usecases/policy';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';
import { z } from 'zod';

const BulkDeletePolicySchema = z.object({
    policyIds: z.array(z.string().min(1)).min(1).max(100),
});

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkDeletePolicySchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkDeletePolicy(ctx, body.policyIds);
            return jsonResponse(result);
        },
    ),
);
