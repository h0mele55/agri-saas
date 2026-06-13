import { getTenantCtx } from '@/app-layer/context';
import { markOperationParcel } from '@/app-layer/usecases/field-operation';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateOperationParcelSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const PATCH = withApiErrorHandling(withValidatedBody(UpdateOperationParcelSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; taskId: string; lineId: string }> }, body) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const result = await markOperationParcel(ctx, params.taskId, params.lineId, body.status, body.note ?? undefined);
    return jsonResponse(result);
}));
