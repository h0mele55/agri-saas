/**
 * GET /api/t/[tenantSlug]/risks/analytics
 *
 * B10 — Quantitative risk analytics. Returns the
 * `RiskQuantitativeAnalytics` payload (totals + top-by-ALE +
 * category distribution + loss-exceedance-curve points).
 *
 * Auth: `assertCanRead` inside the usecase — same gate as the
 * risk dashboard.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getRiskQuantitativeAnalytics } from '@/app-layer/usecases/risk-analytics';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        {
            params: paramsPromise,
        }: { params: Promise<{ tenantSlug: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const analytics = await getRiskQuantitativeAnalytics(ctx);
        return jsonResponse(analytics);
    },
);
