import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { assertModuleEnabled } from '@/app-layer/usecases/modules';
import { listPlantings } from '@/app-layer/usecases/crop-planning';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * Plantings — engine-generated succession instances (PLANNING module).
 *   GET → list plantings, filtered by ?cropPlanId (the succession board
 *         reads this) and optionally ?status.
 */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await assertModuleEnabled(ctx, 'PLANNING');
        const QuerySchema = z
            .object({ cropPlanId: z.string().optional(), status: z.string().optional() })
            .strip();
        const query = QuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
        const plantings = await listPlantings(ctx, {
            cropPlanId: query.cropPlanId,
            status: query.status,
        });
        return jsonResponse(plantings);
    },
);
