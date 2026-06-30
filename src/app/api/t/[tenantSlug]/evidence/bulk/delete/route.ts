/**
 * POST /api/t/:slug/evidence/bulk/delete
 *
 * Bulk soft-delete evidence (the evidence table selection action-row).
 * Permission (ADMIN) + tenant isolation are enforced in
 * `bulkDeleteEvidence`. Body: `{ evidenceIds: string[] }`. Returns
 * `{ deleted: n }`.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { bulkDeleteEvidence } from '@/app-layer/usecases/evidence';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';
import { z } from 'zod';

const BulkDeleteEvidenceSchema = z.object({
    evidenceIds: z.array(z.string().min(1)).min(1).max(100),
});

export const POST = withApiErrorHandling(
    withValidatedBody(
        BulkDeleteEvidenceSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await bulkDeleteEvidence(ctx, body.evidenceIds);
            return jsonResponse(result);
        },
    ),
);
