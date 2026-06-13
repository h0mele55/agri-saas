import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getFieldOperation } from '@/app-layer/usecases/field-operation';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; taskId: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const data = await getFieldOperation(ctx, params.taskId);
    return jsonResponse(data);
});
