import { getTenantCtx } from '@/app-layer/context';
import { assertModuleEnabled } from '@/app-layer/usecases/modules';
import { blendLots } from '@/app-layer/usecases/grain-blend';
import { BlendLotsSchema } from '@/app-layer/schemas/grain.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/**
 * Grain blending (GRAIN module).
 *   POST → consume N source lots into one blended output lot. The stock
 *          effect flows through the ledger seam (CONSUMPTION per source +
 *          a RECEIPT for the output) and one MERGE genealogy edge per
 *          source → output. Quality attributes are the quantity-weighted
 *          average of the source lots.
 */

export const POST = withApiErrorHandling(
    withValidatedBody(
        BlendLotsSchema,
        async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            await assertModuleEnabled(ctx, 'GRAIN');
            const result = await blendLots(ctx, body);
            return jsonResponse(result, { status: 201 });
        },
    ),
);
