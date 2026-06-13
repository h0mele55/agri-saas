import { getTenantCtx } from '@/app-layer/context';
import { updateParcel, deleteParcel } from '@/app-layer/usecases/parcel';
import { UpdateParcelSchema } from '@/app-layer/schemas/geo.schemas';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { NextRequest } from 'next/server';

type Ctx = { params: Promise<{ tenantSlug: string; id: string; parcelId: string }> };

export const PATCH = withApiErrorHandling(
    withValidatedBody(UpdateParcelSchema, async (req, { params: paramsPromise }: Ctx, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const res = await updateParcel(ctx, params.parcelId, body);
        return jsonResponse(res);
    }),
);

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: Ctx) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const res = await deleteParcel(ctx, params.parcelId);
    return jsonResponse(res);
});
