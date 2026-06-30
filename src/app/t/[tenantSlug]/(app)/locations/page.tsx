import { getTenantCtx } from '@/app-layer/context';
import { LocationsClient } from './LocationsClient';

export default async function LocationsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    return <LocationsClient tenantSlug={tenantSlug} canAdmin={ctx.permissions.canAdmin} />;
}
