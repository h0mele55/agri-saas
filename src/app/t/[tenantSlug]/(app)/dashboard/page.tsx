import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

import { auth } from '@/auth';
import { getTenantCtx } from '@/app-layer/context';
import { getHomeGreeting } from '@/app-layer/usecases/home-greeting';

import DashboardClient from './DashboardClient';
import GreetingHeader from './GreetingHeader';
import RecentActivityCard from './RecentActivityCard';
import { Card } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

/**
 * Executive Dashboard — server shell.
 *
 * The dashboard is a thin server shell:
 *
 *   1. This server component fetches the greeting + session once on
 *      every navigation, so the first paint contains real data — no
 *      loading flash.
 *
 *   2. `RecentActivityCard` stays a server component (no API route
 *      yet). It's rendered HERE and passed as `children` to
 *      `<DashboardClient>` so its server boundary survives the
 *      client-component edge.
 *
 * The farm dashboard was trimmed to onboarding + the "your farm
 * today" ag strip + the open-field-tasks hero + recent activity; the
 * compliance-era KPI / trend / readiness payloads are no longer
 * fetched here.
 */
export default async function DashboardPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });

    const [greeting, session] = await Promise.all([
        getHomeGreeting(ctx),
        auth(),
    ]);

    return (
        <div className="space-y-section">
            <GreetingHeader
                name={session?.user?.name ?? null}
                avatarUrl={session?.user?.image ?? null}
                data={greeting}
            />
            <DashboardClient>
            <Suspense
                fallback={
                    <Card className="space-y-compact">
                        <Skeleton className="h-4 w-full sm:w-32" />
                    </Card>
                }
            >
                <RecentActivityCard
                    tenantSlug={tenantSlug}
                    label="Recent Activity"
                    noActivityLabel="No recent activity"
                />
            </Suspense>
            </DashboardClient>
        </div>
    );
}
