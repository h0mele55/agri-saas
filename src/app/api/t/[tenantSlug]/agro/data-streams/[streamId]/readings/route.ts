import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listReadings } from '@/app-layer/usecases/data-stream';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * Readings for a data stream (Agro-intel) — tenant-scoped, authenticated.
 *   GET → most-recent readings for the stream (bounded).
 */
export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; streamId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const readings = await listReadings(ctx, params.streamId);
        return jsonResponse(readings);
    },
);
