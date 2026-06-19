import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getLocationSmartDefaults } from '@/app-layer/usecases/smart-defaults';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const defaults = await getLocationSmartDefaults(ctx, params.id);
    return jsonResponse(defaults);
});
