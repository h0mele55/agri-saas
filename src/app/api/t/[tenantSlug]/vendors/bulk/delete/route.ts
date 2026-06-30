/**
 * POST /api/t/:slug/vendors/bulk/delete
 *
 * Bulk soft-delete vendors (the vendors table selection action-row).
 * Permission (ADMIN/EDITOR) + tenant isolation are enforced in
 * `bulkDeleteVendor`. Body: `{ vendorIds: string[] }`. Returns
 * `{ deleted: n }`.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkDeleteVendor } from '@/app-layer/usecases/vendor';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';
import { z } from 'zod';

const BulkDeleteVendorSchema = z.object({
    vendorIds: z.array(z.string().min(1)).min(1).max(100),
});

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkDeleteVendorSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkDeleteVendor(ctx, body.vendorIds);
            return jsonResponse(result);
        },
    ),
);
