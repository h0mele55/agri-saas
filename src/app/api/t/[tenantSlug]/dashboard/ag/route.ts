import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getAgDashboard } from '@/app-layer/usecases/ag-dashboard';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * Agriculture dashboard strip data.
 *   GET → { enabledModules, recentJournal[], lowStock[], myTasks[] }
 *
 * Read-only aggregation over the existing journal / inventory / farm-task
 * list usecases (each already authorizes + scopes to the tenant). The
 * payload carries the tenant's enabled modules so the client strip can
 * gate each card to the module that owns it.
 */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const payload = await getAgDashboard(ctx);
        return jsonResponse(payload);
    },
);
