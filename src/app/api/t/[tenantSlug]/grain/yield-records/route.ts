import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { assertModuleEnabled } from '@/app-layer/usecases/modules';
import { listYieldRecords, createYieldRecord } from '@/app-layer/usecases/yield-record';
import { CreateYieldRecordSchema } from '@/app-layer/schemas/grain.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/**
 * Yield records — actual harvest production totals (GRAIN module).
 *   GET  → list yield records (newest harvest first; ?seasonId= / ?locationId=
 *          / ?plantingId= filters), each with a computed t/ha.
 *   POST → create a yield record.
 */

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await assertModuleEnabled(ctx, 'GRAIN');
        const sp = req.nextUrl.searchParams;
        const records = await listYieldRecords(ctx, {
            seasonId: sp.get('seasonId') ?? undefined,
            locationId: sp.get('locationId') ?? undefined,
            plantingId: sp.get('plantingId') ?? undefined,
        });
        return jsonResponse(records);
    },
);

export const POST = withApiErrorHandling(
    withValidatedBody(
        CreateYieldRecordSchema,
        async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            await assertModuleEnabled(ctx, 'GRAIN');
            const record = await createYieldRecord(ctx, body);
            return jsonResponse(record, { status: 201 });
        },
    ),
);
