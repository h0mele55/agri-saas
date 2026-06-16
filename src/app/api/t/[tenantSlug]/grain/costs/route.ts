import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { assertModuleEnabled } from '@/app-layer/usecases/modules';
import {
    getCostRollupByPlanting,
    getCostRollupBySeason,
    getCostRollupByField,
} from '@/app-layer/usecases/cost-rollup';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * Per-activity cost rollup (GRAIN module).
 *   GET ?by=planting|field|season (default planting) — rolls up
 *       LogEntry.costAmount + linked StockTransaction.costAmount grouped by
 *       the requested dimension. ?seasonId= narrows the planting rollup.
 */

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await assertModuleEnabled(ctx, 'GRAIN');

        const by = req.nextUrl.searchParams.get('by') ?? 'planting';
        if (by === 'season') {
            return jsonResponse({ by, rows: await getCostRollupBySeason(ctx) });
        }
        if (by === 'field') {
            return jsonResponse({ by, rows: await getCostRollupByField(ctx) });
        }
        const seasonId = req.nextUrl.searchParams.get('seasonId') ?? undefined;
        return jsonResponse({ by: 'planting', rows: await getCostRollupByPlanting(ctx, { seasonId }) });
    },
);
