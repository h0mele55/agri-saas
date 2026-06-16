import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { assertModuleEnabled } from '@/app-layer/usecases/modules';
import { listContracts, createContract } from '@/app-layer/usecases/contract';
import { CreateContractSchema } from '@/app-layer/schemas/grain.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/**
 * Contracts — grain marketing / supply contracts (GRAIN module).
 *   GET  → list contracts (newest first; ?status= / ?type= / ?seasonId= filters).
 *   POST → create a contract.
 */

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await assertModuleEnabled(ctx, 'GRAIN');
        const sp = req.nextUrl.searchParams;
        const contracts = await listContracts(ctx, {
            status: sp.get('status') ?? undefined,
            type: sp.get('type') ?? undefined,
            seasonId: sp.get('seasonId') ?? undefined,
        });
        return jsonResponse(contracts);
    },
);

export const POST = withApiErrorHandling(
    withValidatedBody(
        CreateContractSchema,
        async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            await assertModuleEnabled(ctx, 'GRAIN');
            const contract = await createContract(ctx, body);
            return jsonResponse(contract, { status: 201 });
        },
    ),
);
