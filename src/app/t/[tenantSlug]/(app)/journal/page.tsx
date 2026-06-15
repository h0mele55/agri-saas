import { getTenantCtx } from '@/app-layer/context';
import { listLogEntries } from '@/app-layer/usecases/journal';
import { JournalClient } from './JournalClient';

export const dynamic = 'force-dynamic';

/**
 * Field Journal — Server Component wrapper.
 *
 * Fetches the journal list server-side (with URL filters applied),
 * delegates interaction to the client island. Mirrors the Assets page.
 */
export default async function JournalPage({
    params,
    searchParams,
}: {
    params: Promise<{ tenantSlug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { tenantSlug } = await params;
    const sp = await searchParams;

    const ctx = await getTenantCtx({ tenantSlug });

    const filters: Record<string, string> = {};
    for (const key of ['q', 'type', 'status']) {
        const val = sp[key];
        if (typeof val === 'string' && val) filters[key] = val;
    }

    const entries = await listLogEntries(ctx, Object.keys(filters).length > 0 ? filters : undefined);

    return (
        <div className="space-y-section animate-fadeIn">
            <JournalClient
                initialEntries={JSON.parse(JSON.stringify(entries))}
                initialFilters={filters}
                tenantSlug={tenantSlug}
                permissions={{ canWrite: ctx.permissions.canWrite }}
            />
        </div>
    );
}
