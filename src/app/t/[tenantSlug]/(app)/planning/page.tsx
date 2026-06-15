import { getTenantCtx } from '@/app-layer/context';
import { listCropPlans, listSeasons, listCropTypes, listCropVarieties } from '@/app-layer/usecases/crop-planning';
import { CropPlansClient } from './CropPlansClient';

export const dynamic = 'force-dynamic';

/**
 * Crop Planning — Server Component wrapper.
 *
 * Fetches the crop plans + the catalogs the create-plan modal needs
 * (seasons / crop types / varieties) server-side, then delegates
 * interaction to the client island. Mirrors the Journal page.
 */
export default async function PlanningPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });

    const [plans, seasons, cropTypes, varieties] = await Promise.all([
        listCropPlans(ctx),
        listSeasons(ctx),
        listCropTypes(ctx),
        listCropVarieties(ctx),
    ]);

    return (
        <div className="space-y-section animate-fadeIn">
            <CropPlansClient
                initialPlans={JSON.parse(JSON.stringify(plans))}
                seasons={JSON.parse(JSON.stringify(seasons))}
                cropTypes={JSON.parse(JSON.stringify(cropTypes))}
                varieties={JSON.parse(JSON.stringify(varieties))}
                tenantSlug={tenantSlug}
                permissions={{ canWrite: ctx.permissions.canWrite }}
            />
        </div>
    );
}
