import { getTenantCtx } from '@/app-layer/context';
import { listArticles } from '@/app-layer/usecases/knowledge';
import { KnowledgeClient } from './KnowledgeClient';

export const dynamic = 'force-dynamic';

// SSR fetch is capped so the initial HTML payload + DB query stay
// bounded as tenants accumulate articles. The SWR client immediately
// re-fetches the unbounded list in the background and swaps it in
// transparently (mirrors the Policies page).
const SSR_PAGE_LIMIT = 100;

/**
 * Knowledge Base — Server Component.
 * Fetches the article list server-side (with URL filters applied) and
 * delegates interaction to the client island. Mirrors PoliciesPage.
 */
export default async function KnowledgePage({
    params,
    searchParams,
}: {
    params: Promise<{ tenantSlug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const { tenantSlug } = await params;
    const sp = await searchParams;

    const ctx = await getTenantCtx({ tenantSlug });

    // Build filters from searchParams for the server-side data fetch.
    const filters: Record<string, string> = {};
    for (const key of ['q', 'status', 'category']) {
        const val = sp[key];
        if (typeof val === 'string' && val) filters[key] = val;
    }

    const articles = await listArticles(
        ctx,
        Object.keys(filters).length > 0 ? filters : undefined,
    );

    return (
        <KnowledgeClient
            initialArticles={JSON.parse(JSON.stringify(articles)).slice(
                0,
                SSR_PAGE_LIMIT,
            )}
            initialFilters={filters}
            tenantSlug={tenantSlug}
            permissions={ctx.permissions}
        />
    );
}
