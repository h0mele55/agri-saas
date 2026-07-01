/**
 * DashboardClient — SWR-driven behaviour test.
 *
 * After the farm-UI trim the dashboard's only SWR-backed card is the
 * open-field-tasks hero, which reads the shared `/farm-tasks` list.
 * This test pins the three acceptance criteria that survived the trim:
 *
 *   1. **Cards load via SWR.** The hero count reflects the
 *      `/api/t/{slug}/farm-tasks` payload once it resolves (open =
 *      rows whose status is not terminal).
 *
 *   2. **Background refresh works.** Writing a fresh payload into the
 *      cache key via SWR's keyed `mutate(...)` (the same hook a future
 *      `useTenantMutation` invalidate-array would use) updates the
 *      hero without a page reload.
 *
 *   3. **No coarse refresh.** The client never reaches for
 *      `useRouter().refresh()`.
 */

import * as React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig, useSWRConfig } from 'swr';
import { TooltipProvider } from '@/components/ui/tooltip';

jest.mock('@/lib/tenant-context-provider', () => ({
    useTenantApiUrl:
        () => (path: string) =>
            `/api/t/acme${path.startsWith('/') ? path : `/${path}`}`,
    useTenantHref: () => (path: string) => `/t/acme${path}`,
}));

jest.mock('next-intl', () => ({
    // Test-only translator: returns the key + an interpolated count
    // when present, so assertions can match real string output.
    useTranslations: () => (key: string, opts?: Record<string, unknown>) =>
        opts && 'count' in opts ? `${key}:${opts.count}` : key,
}));

// next/link calls into next/navigation. Stub the router so we can
// also assert that `refresh()` is NEVER invoked by the component.
const refreshSpy = jest.fn();
jest.mock('next/navigation', () => ({
    useRouter: () => ({
        push: jest.fn(),
        replace: jest.fn(),
        back: jest.fn(),
        forward: jest.fn(),
        refresh: refreshSpy,
        prefetch: jest.fn(),
    }),
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
}));

// Onboarding banner queries its own state — stub it out so the
// dashboard test stays focused on the SWR contract.
jest.mock('@/components/onboarding/OnboardingBanner', () => {
    const Stub = () => <div data-testid="onboarding-banner-stub" />;
    Stub.displayName = 'OnboardingBannerStub';
    return Stub;
});

import DashboardClient from '@/app/t/[tenantSlug]/(app)/dashboard/DashboardClient';

const FARM_TASKS_KEY = '/api/t/acme/farm-tasks';

// ── fetch mock ─────────────────────────────────────────────────────────

const fetchMock = jest.fn();
beforeEach(() => {
    fetchMock.mockReset();
    refreshSpy.mockReset();
    (global as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;
});

// Route by URL: farm-tasks returns the supplied list; every other
// endpoint (e.g. the module-gated `/dashboard/ag` strip) resolves to
// null so the ag strip renders nothing and stays out of the way.
function routeFetch(farmTasks: Array<{ id: string; status: string }>) {
    fetchMock.mockImplementation(async (url: string) => ({
        ok: true,
        json: async () => (url === FARM_TASKS_KEY ? farmTasks : null),
    }));
}

function makeWrapper() {
    return function Wrapper({ children }: { children: React.ReactNode }) {
        // HeroMetric's delta chip + StatusBadge use Radix Tooltip and
        // need a TooltipProvider in scope. Real app injection happens
        // via the root layout — replicating it here keeps the harness
        // close to production.
        return (
            <SWRConfig
                value={{
                    provider: () => new Map(),
                    shouldRetryOnError: false,
                }}
            >
                <TooltipProvider>{children}</TooltipProvider>
            </SWRConfig>
        );
    };
}

function heroValue(): string {
    return within(screen.getByTestId('dashboard-hero'))
        .getByText((_, el) => el?.getAttribute('data-hero-metric-value') === 'true')
        .textContent!.trim();
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('DashboardClient — SWR behaviour', () => {
    it('renders the open-field-tasks count from the /farm-tasks cache', async () => {
        // 3 rows, one terminal (CLOSED) → 2 open field tasks.
        routeFetch([
            { id: 't1', status: 'OPEN' },
            { id: 't2', status: 'IN_PROGRESS' },
            { id: 't3', status: 'CLOSED' },
        ]);

        render(<DashboardClient />, { wrapper: makeWrapper() });

        await waitFor(() => expect(heroValue()).toBe('2'));
    });

    it('updates the hero when the SWR cache key is mutated externally', async () => {
        routeFetch([{ id: 't1', status: 'OPEN' }]);

        // The scoped SWRConfig (provider: () => new Map()) creates a
        // per-test cache that the global `mutate` from 'swr' does NOT
        // reach. Grab `mutate` from `useSWRConfig()` — that one IS
        // scoped to the same cache the dashboard reads from.
        let scopedMutate: ReturnType<typeof useSWRConfig>['mutate'] | null = null;
        function MutateBridge() {
            scopedMutate = useSWRConfig().mutate;
            return null;
        }

        render(
            <>
                <MutateBridge />
                <DashboardClient />
            </>,
            { wrapper: makeWrapper() },
        );

        await waitFor(() => expect(heroValue()).toBe('1'));

        // Imitate what a `useTenantMutation({ ..., invalidate: [...] })`
        // site would do post-mutation: write a fresh payload straight
        // into the farm-tasks cache. The hero re-renders without any
        // router.refresh().
        await act(async () => {
            await scopedMutate!(
                FARM_TASKS_KEY,
                [
                    { id: 't1', status: 'OPEN' },
                    { id: 't2', status: 'OPEN' },
                    { id: 't3', status: 'OPEN' },
                ],
                { revalidate: false },
            );
        });

        await waitFor(() => expect(heroValue()).toBe('3'));
        expect(refreshSpy).not.toHaveBeenCalled();
    });

    it('passes RecentActivityCard children through unchanged (server-boundary preservation)', () => {
        routeFetch([]);
        render(
            <DashboardClient>
                <div data-testid="recent-activity-card">recent activity</div>
            </DashboardClient>,
            { wrapper: makeWrapper() },
        );

        expect(screen.getByTestId('recent-activity-card')).toBeInTheDocument();
    });
});
