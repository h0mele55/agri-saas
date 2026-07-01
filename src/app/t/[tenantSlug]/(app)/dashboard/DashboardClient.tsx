/**
 * Farm dashboard — client shell.
 *
 * The dashboard was trimmed to the farm essentials: the guided
 * onboarding banner, the "your farm today" ag strip, the open-field-
 * tasks hero, and the recent-activity feed. The compliance-era
 * surfaces (risk / evidence KPI tiles, the compliance-trend charts,
 * and the next-best-action "readiness" card) were removed.
 *
 * Data-fetching pattern (Epic 69 SWR-first): the hero reads the same
 * `/farm-tasks` list the Farm Tasks page uses (SWR-cached, shared),
 * and `RecentActivityCard` stays a Server Component passed in as
 * `children` from `page.tsx` so its server boundary survives the
 * client-component edge.
 */
'use client';

import * as React from 'react';
import { useTranslations } from 'next-intl';

import OnboardingBanner from '@/components/onboarding/OnboardingBanner';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { HeroMetric } from '@/components/ui/HeroMetric';
import AgDashboardStrip from './AgDashboardStrip';

// Terminal work-item statuses — everything else is an open/active field
// task (mirrors the Farm Tasks list page's status set). Used by the
// masthead hero's open-field-tasks count.
const FARM_TASK_DONE_STATUSES = new Set(['RESOLVED', 'CLOSED', 'CANCELED']);

/** Minimal `/farm-tasks` row — the hero only needs the status to count. */
interface FarmHeroTaskRow {
    id: string;
    status: string;
}

// ─── Component ────────────────────────────────────────────────────────

interface DashboardClientProps {
    /**
     * RecentActivityCard remains a Server Component (no API route
     * yet) and is rendered into the dashboard tree by the parent
     * server page. Passing it through `children` preserves the
     * server boundary.
     */
    children?: React.ReactNode;
}

export default function DashboardClient({ children }: DashboardClientProps) {
    const t = useTranslations('dashboard');

    // UI-15: the dashboard no longer surfaces a notifications button on a new
    // notification — the top-bar notifications bell is the single canonical
    // affordance. Header carries no extra action here.
    const headerActions = undefined;

    // Masthead hero — open field tasks. The legacy control-coverage hero
    // was retired when the compliance surfaces left the farm app. Reads
    // the same `/farm-tasks` list the Farm Tasks page uses (SWR-cached,
    // shared) and counts rows whose status is not terminal. 0 while the
    // list is still loading / empty — no skeleton flash.
    const { data: farmTasks } = useTenantSWR<FarmHeroTaskRow[]>('/farm-tasks');
    const openFarmTasks = (Array.isArray(farmTasks) ? farmTasks : []).filter(
        (task) => !FARM_TASK_DONE_STATUSES.has(task.status),
    ).length;

    return (
        <DashboardLayout
            header={{
                title: t('title'),
                description: t('subtitle'),
                actions: headerActions,
            }}
        >
            <OnboardingBanner />

            {/* ─── Agriculture strip (module-gated) ───
                A small "your farm today" row. Renders nothing for a tenant
                with neither the JOURNAL nor INVENTORY module enabled. */}
            <AgDashboardStrip />

            {/* ─── Masthead — Hero metric (farm: open field tasks) ─── */}
            <HeroMetric
                eyebrow="Farm tasks"
                value={openFarmTasks}
                description="open field tasks"
                data-testid="dashboard-hero"
            />

            {/* ─── Recent Activity ───
                RecentActivityCard remains a server component; rendered by
                the parent page and passed in here. */}
            {children ?? (
                <Card className="space-y-compact">
                    <Skeleton className="h-4 w-full sm:w-32" />
                    <div className="space-y-tight">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="flex items-start gap-tight">
                                <Skeleton className="h-3 w-full sm:w-28 shrink-0" />
                                <Skeleton
                                    className={`h-3 ${i % 2 === 0 ? 'w-full' : 'w-3/4'}`}
                                />
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </DashboardLayout>
    );
}
