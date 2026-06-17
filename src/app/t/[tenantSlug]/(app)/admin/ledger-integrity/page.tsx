import { getTenantCtx } from '@/app-layer/context';
import {
    listLedgerReconciliationHistory,
    type LedgerReconciliationRun,
} from '@/app-layer/usecases/inventory';
import { PageHeader } from '@/components/layout/PageHeader';
import { LedgerIntegrityClient } from './LedgerIntegrityClient';

export const dynamic = 'force-dynamic';

/**
 * Admin — Stock Ledger Integrity.
 *
 * The operator surface for the `reconcileStockLedger` usecase: shows
 * the latest integrity verdict, a "Run reconciliation" button (POSTs
 * the admin route, gated `admin.manage`), and the timeline of past
 * runs. History is reconstructed from the `LEDGER_RECONCILIATION_RUN`
 * audit rows — the audit log is the durable record, no separate table.
 *
 * Server component does the history fetch + a role-bound graceful
 * degrade (a member without read access sees an empty timeline rather
 * than an authorization error); the interactive island lives in the
 * client component.
 */
export default async function LedgerIntegrityPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });

    let history: LedgerReconciliationRun[] = [];
    try {
        history = await listLedgerReconciliationHistory(ctx);
    } catch {
        // Member may lack read access — gracefully degrade to empty.
        history = [];
    }

    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;

    return (
        <div className="space-y-section animate-fadeIn">
            <PageHeader
                breadcrumbs={[
                    { label: 'Dashboard', href: tenantHref('/dashboard') },
                    { label: 'Admin', href: tenantHref('/admin') },
                    { label: 'Ledger Integrity' },
                ]}
                title="Stock Ledger Integrity"
                description="Verify the append-only stock ledger's hash chain and review past reconciliation runs."
            />

            <LedgerIntegrityClient history={JSON.parse(JSON.stringify(history))} />
        </div>
    );
}
