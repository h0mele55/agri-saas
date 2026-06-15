import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { assertModuleEnabled } from '@/app-layer/usecases/modules';
import { getPlantingGdd } from '@/app-layer/usecases/agro-gdd';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * Planting GDD (PLANNING module).
 *   GET → accumulated Growing Degree Days for the planting, from its sow
 *         date to today, over the WeatherObservation rows pulled for the
 *         planting's location. `{ totalGdd, days, targetGdd, baseTempC }`.
 */
export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; plantingId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await assertModuleEnabled(ctx, 'PLANNING');
        const gdd = await getPlantingGdd(ctx, params.plantingId);
        return jsonResponse(gdd);
    },
);
