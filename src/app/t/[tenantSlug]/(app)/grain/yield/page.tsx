import { getTenantCtx } from '@/app-layer/context';
import { listYieldRecords } from '@/app-layer/usecases/yield-record';
import { YieldClient } from './YieldClient';

export const dynamic = 'force-dynamic';

/**
 * Yield — Server Component.
 *
 * Fetches the yield-record list server-side via the usecase (each row
 * carries a computed t/ha), then delegates interaction to the client
 * island. The route base is `/grain/yield`; the API is
 * `/grain/yield-records`. The GRAIN module gate is handled once in the
 * route-group layout.
 */
export default async function GrainYieldPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });

    const records = await listYieldRecords(ctx);

    return (
        <YieldClient
            initialRecords={JSON.parse(JSON.stringify(records))}
            tenantSlug={tenantSlug}
            permissions={{ canWrite: ctx.permissions.canWrite }}
        />
    );
}
