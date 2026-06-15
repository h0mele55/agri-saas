import { getTenantCtx } from '@/app-layer/context';
import { listSeasons } from '@/app-layer/usecases/crop-planning';
import { SeasonsClient } from './SeasonsClient';

export const dynamic = 'force-dynamic';

/**
 * Seasons — Server Component wrapper. Minimal list + create surface for
 * crop-planning season windows. The `/planning` group layout already
 * gates on the PLANNING module.
 */
export default async function SeasonsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    const seasons = await listSeasons(ctx);

    return (
        <div className="space-y-section animate-fadeIn">
            <SeasonsClient
                initialSeasons={JSON.parse(JSON.stringify(seasons))}
                tenantSlug={tenantSlug}
                permissions={{ canWrite: ctx.permissions.canWrite }}
            />
        </div>
    );
}
