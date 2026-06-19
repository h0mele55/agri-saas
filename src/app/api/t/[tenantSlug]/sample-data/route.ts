/**
 * "Try it with sample data" — tenant-scoped, reversible sample dataset.
 *
 *   GET    → { hasSampleData: boolean }   (read — tasks.view)
 *   POST   → { created: boolean }         (write — tasks.create)
 *   DELETE → { cleared: number }          (write — tasks.create)
 *
 * The route is NOT under the admin/billing/sso/security privileged
 * roots, so it carries no ROUTE_PERMISSIONS entry (that map only
 * enumerates those roots; an entry here would be flagged an orphan rule).
 * It still enforces server-side permission via requirePermission(...).
 * `tasks.view` / `tasks.create` are the closest farmer-facing read/write
 * keys (every member can read; READER/AUDITOR cannot write) — sample
 * data spans Location/Parcel/InventoryLot/LogEntry, none of which has a
 * dedicated permission domain.
 */
import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { hasSampleData, loadSampleData, clearSampleData } from '@/app-layer/usecases/sample-data';

export const GET = withApiErrorHandling(
    requirePermission('tasks.view', async (_req: NextRequest, _routeArgs, ctx) => {
        return jsonResponse({ hasSampleData: await hasSampleData(ctx) });
    }),
);

export const POST = withApiErrorHandling(
    requirePermission('tasks.create', async (_req: NextRequest, _routeArgs, ctx) => {
        return jsonResponse(await loadSampleData(ctx));
    }),
);

export const DELETE = withApiErrorHandling(
    requirePermission('tasks.create', async (_req: NextRequest, _routeArgs, ctx) => {
        return jsonResponse(await clearSampleData(ctx));
    }),
);
