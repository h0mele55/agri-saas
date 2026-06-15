import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { assertModuleEnabled } from '@/app-layer/usecases/modules';
import { generatePlantings } from '@/app-layer/usecases/crop-planning';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * Generate (or regenerate) a crop plan's plantings + field tasks
 * (PLANNING module). POST runs the succession engine over the plan's
 * config + variety defaults, persists the Planting rows (idempotent —
 * only PLANNED rows are replaced; SOWN+ rows survive), and fans out the
 * SOW / TRANSPLANT / HARVEST field tasks linked back to each planting.
 *
 * No request body — the plan id in the URL is the whole input.
 */
export const POST = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; cropPlanId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await assertModuleEnabled(ctx, 'PLANNING');
        const result = await generatePlantings(ctx, params.cropPlanId);
        return jsonResponse(result, { status: 201 });
    },
);
