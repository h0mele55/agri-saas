import { getTenantCtx } from '@/app-layer/context';
import { requireModule } from '@/lib/security/require-module';

/**
 * Module gate for the `grain` (enterprise-grain) route group.
 *
 * Gated behind the GRAIN module: a tenant that cannot access it —
 * either its plan doesn't reach the GRAIN tier, or the module is
 * toggled off in TenantModuleSettings — is redirected before any page
 * in this group (contracts / bins / yield / costs) renders. Gating
 * once at the route-group layout covers every nested page with a
 * single server-side check, the redirect twin of the API's
 * `assertModuleEnabled`.
 */
export default async function GrainGroupLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    await requireModule(ctx, 'GRAIN');
    return <>{children}</>;
}
