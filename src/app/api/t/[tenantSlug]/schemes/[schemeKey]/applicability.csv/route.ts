import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { assertModuleEnabled } from '@/app-layer/usecases/modules';
import { getSoA } from '@/app-layer/usecases/soa';
import { withApiErrorHandling } from '@/lib/errors/api';
import { logEvent } from '@/app-layer/events/audit';
import { runInTenantContext } from '@/lib/db-context';
import { buildSoACsv } from '@/lib/reports/soa-csv';

/**
 * Applicability-statement CSV export for a certification scheme.
 *
 * The "applicability statement" for a scheme is just the Statement of
 * Applicability pinned to that AG_SCHEME framework key — so this route
 * runs `getSoA` with an explicit `frameworkKey` and renders it through
 * the SAME shared `buildSoACsv` builder + column shape as the generic
 * `reports/soa/export.csv` route. Gated behind the CERTIFICATION module.
 */

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; schemeKey: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await assertModuleEnabled(ctx, 'CERTIFICATION');

        const report = await getSoA(ctx, {
            frameworkKey: params.schemeKey,
            includeEvidence: true,
            includeTasks: true,
            includeTests: true,
        });

        const csv = buildSoACsv(report);

        await runInTenantContext(ctx, (db) =>
            logEvent(db, ctx, {
                action: 'SOA_EXPORTED',
                entityType: 'SoAReport',
                entityId: report.framework,
                details: `Applicability statement exported as CSV for ${report.framework} (${report.entries.length} entries)`,
                metadata: { format: 'csv', scheme: report.framework, entryCount: report.entries.length },
            }),
        );

        // Filename uses the scheme key, sanitised to safe chars.
        const now = new Date().toISOString().slice(0, 10);
        const safeKey = (report.framework || 'scheme').replace(/[^A-Za-z0-9._-]/g, '_');
        const filename = `${ctx.tenantSlug || 'tenant'}_${safeKey}_applicability_${now}.csv`;

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
                'Cache-Control': 'no-cache, no-store',
            },
        });
    },
);
