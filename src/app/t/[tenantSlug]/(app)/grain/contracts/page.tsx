import { getTenantCtx } from '@/app-layer/context';
import { listContracts } from '@/app-layer/usecases/contract';
import { ContractsClient } from './ContractsClient';

export const dynamic = 'force-dynamic';

/**
 * Contracts — Server Component.
 *
 * Fetches the contract list server-side via the usecase, then delegates
 * all interaction to the client island (which hydrates React Query with
 * this slice and refetches via the GET API on filter changes). The
 * GRAIN module gate is handled once in the route-group layout.
 */
export default async function GrainContractsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });

    const contracts = await listContracts(ctx);

    return (
        <ContractsClient
            initialContracts={JSON.parse(JSON.stringify(contracts))}
            tenantSlug={tenantSlug}
            permissions={{ canWrite: ctx.permissions.canWrite }}
        />
    );
}
