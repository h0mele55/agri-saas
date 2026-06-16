import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { assertModuleEnabled } from '@/app-layer/usecases/modules';
import {
    getYieldRecord,
    updateYieldRecord,
    deleteYieldRecord,
} from '@/app-layer/usecases/yield-record';
import { UpdateYieldRecordSchema } from '@/app-layer/schemas/grain.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/**
 * A single yield record (GRAIN module).
 *   GET    → the record (+ planting / location / season, computed t/ha).
 *   PATCH  → update record fields (write-gated).
 *   DELETE → soft-delete the record (write-gated).
 */

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; yieldRecordId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await assertModuleEnabled(ctx, 'GRAIN');
        const record = await getYieldRecord(ctx, params.yieldRecordId);
        return jsonResponse(record);
    },
);

export const PATCH = withApiErrorHandling(
    withValidatedBody(
        UpdateYieldRecordSchema,
        async (
            req,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string; yieldRecordId: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            await assertModuleEnabled(ctx, 'GRAIN');
            const record = await updateYieldRecord(ctx, params.yieldRecordId, body);
            return jsonResponse(record);
        },
    ),
);

export const DELETE = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; yieldRecordId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await assertModuleEnabled(ctx, 'GRAIN');
        const result = await deleteYieldRecord(ctx, params.yieldRecordId);
        return jsonResponse(result);
    },
);
