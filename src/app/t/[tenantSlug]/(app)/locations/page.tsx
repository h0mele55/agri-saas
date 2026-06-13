import { LocationsClient } from './LocationsClient';

export default async function LocationsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
    const { tenantSlug } = await params;
    return <LocationsClient tenantSlug={tenantSlug} />;
}
