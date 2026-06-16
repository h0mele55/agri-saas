import { getTenantCtx } from '@/app-layer/context';
import { listBins } from '@/app-layer/usecases/grain-bin';
import { BinsClient } from './BinsClient';

export const dynamic = 'force-dynamic';

/**
 * Bins — Server Component.
 *
 * Fetches the grain-bin list (BIN/STORAGE Locations with a computed fill)
 * server-side via the usecase, then delegates interaction to the client
 * island. The GRAIN module gate is handled once in the route-group
 * layout.
 */
export default async function GrainBinsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });

    const bins = await listBins(ctx);

    return (
        <BinsClient
            initialBins={JSON.parse(JSON.stringify(bins))}
            tenantSlug={tenantSlug}
            permissions={{ canWrite: ctx.permissions.canWrite }}
        />
    );
}
