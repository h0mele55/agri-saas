import { test, expect } from '@playwright/test';
import { loginAndGetTenant, safeGoto } from './e2e-utils';

/**
 * FilterToolbar contract — Tasks and Vendors.
 *
 * The Controls page has its own canonical coverage in
 * `controls-filter-epic53.spec.ts`. This spec extends that contract to
 * the two other migrated list pages (Tasks, Vendors).
 *
 * The pre-Epic-53 version of this file exercised the deprecated
 * `CompactFilterBar` DOM (`filter-dd-status`, `filter-chip-overdue`,
 * etc.). The shared `FilterToolbar` aggregates every filter behind a
 * single popover, so the tests below drive the actual UI:
 *
 *   1. Click the trigger → the cmdk listbox appears.
 *   2. Click the top-level filter (e.g. "Type") → value options appear.
 *   3. Click a value → the URL picks up the param.
 *
 * NOTE: R14 (#443) removed the free-text search input from every list
 * page — the per-page `search input writes q param` tests and the
 * `URL persistence` block (both driven by `#task-search` / `#vendor-search`
 * / `#control-search`) were deleted. The navbar ⌘K palette is the sole
 * search affordance now.
 */

test.describe('FilterToolbar — Tasks', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;

    test('picking a type filter pushes it into the URL', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/tasks`);
        await page.waitForLoadState('networkidle').catch(() => {});

        await page.getByRole('button', { name: /^filter$/i }).first().click();
        await expect(page.getByRole('listbox').first()).toBeVisible({ timeout: 10000 });

        // Drill into Type
        const typeRow = page.getByRole('option', { name: /^Type$/ });
        await typeRow.waitFor({ state: 'visible', timeout: 5000 });
        await typeRow.click();

        // Pick "Incident"
        const incident = page.getByRole('option', { name: /^Incident$/ });
        await incident.waitFor({ state: 'visible', timeout: 5000 });
        await incident.click();

        await expect(page).toHaveURL(/[?&]type=INCIDENT/, { timeout: 10000 });
    });

    test('picking a severity filter pushes it into the URL', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/tasks`);
        await page.waitForLoadState('networkidle').catch(() => {});

        await page.getByRole('button', { name: /^filter$/i }).first().click();
        await expect(page.getByRole('listbox').first()).toBeVisible({ timeout: 10000 });

        const severityRow = page.getByRole('option', { name: /^Severity$/ });
        await severityRow.waitFor({ state: 'visible', timeout: 5000 });
        await severityRow.click();

        const critical = page.getByRole('option', { name: /^Critical$/ });
        await critical.waitFor({ state: 'visible', timeout: 5000 });
        await critical.click();

        // Long timeout: dev-server can be mid-recompile for /tasks after
        // a long suite, and router.replace is async.
        await expect(page).toHaveURL(/[?&]severity=CRITICAL/, { timeout: 30000 });
    });
});

test.describe('FilterToolbar — Vendors', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;

    test('picking a criticality filter pushes it into the URL', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/vendors`);
        await page.waitForLoadState('networkidle').catch(() => {});

        await page.getByRole('button', { name: /^filter$/i }).first().click();
        await expect(page.getByRole('listbox').first()).toBeVisible({ timeout: 10000 });

        const criticalityRow = page.getByRole('option', { name: /^Criticality$/ });
        await criticalityRow.waitFor({ state: 'visible', timeout: 5000 });
        await criticalityRow.click();

        const high = page.getByRole('option', { name: /^High$/ });
        await high.waitFor({ state: 'visible', timeout: 5000 });
        await high.click();

        await expect(page).toHaveURL(/[?&]criticality=HIGH/, { timeout: 10000 });
    });
});
