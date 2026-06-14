import { getTenantCtx } from '@/app-layer/context';
import { requireModule } from '@/lib/security/require-module';

/**
 * Module gate for the `vendors` (compliance / GRC) route group.
 *
 * Gated behind CERTIFICATION: a tenant on the ag-first default (no
 * CERTIFICATION) is redirected to the dashboard before any page in this
 * group renders. Gating at the route-group layout covers every nested
 * page with a single server-side check.
 */
export default async function ComplianceGroupLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    await requireModule(ctx, 'CERTIFICATION');
    return <>{children}</>;
}
