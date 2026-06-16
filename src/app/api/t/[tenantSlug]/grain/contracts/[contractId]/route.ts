import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { assertModuleEnabled } from '@/app-layer/usecases/modules';
import { getContract, updateContract, deleteContract } from '@/app-layer/usecases/contract';
import { UpdateContractSchema } from '@/app-layer/schemas/grain.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/**
 * A single grain contract (GRAIN module).
 *   GET    → the contract (+ season).
 *   PATCH  → update contract fields (write-gated).
 *   DELETE → soft-delete the contract (write-gated).
 */

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; contractId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await assertModuleEnabled(ctx, 'GRAIN');
        const contract = await getContract(ctx, params.contractId);
        return jsonResponse(contract);
    },
);

export const PATCH = withApiErrorHandling(
    withValidatedBody(
        UpdateContractSchema,
        async (
            req,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string; contractId: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            await assertModuleEnabled(ctx, 'GRAIN');
            const contract = await updateContract(ctx, params.contractId, body);
            return jsonResponse(contract);
        },
    ),
);

export const DELETE = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; contractId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await assertModuleEnabled(ctx, 'GRAIN');
        const result = await deleteContract(ctx, params.contractId);
        return jsonResponse(result);
    },
);
