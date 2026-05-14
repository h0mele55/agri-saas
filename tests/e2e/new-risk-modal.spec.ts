import { test, expect } from '@playwright/test';
import { loginAndGetTenant, safeGoto, waitForHydration } from './e2e-utils';

/**
 * Epic 54 — New Risk modal migration.
 *
 * Verifies the modal replaces the legacy `/risks/new` wizard without
 * breaking deep links. The `/risks/new` route is now a server redirect
 * shim → `/risks?create=1`, which RisksClient detects on mount and
 * opens the modal automatically. The original pre-migration suites
 * that `page.goto('/risks/new')` keep passing against the new surface.
 */

test.describe('Epic 54 — New Risk modal', () => {
    // Each modal test gets its own fresh browser context. The default
    // serial mode shares context across tests, and Radix Dialog leaves
    // residual portal/focus-trap state that blocks the second open()
    // in `next dev`. Per-test contexts are slightly slower but
    // deterministic.

    let tenantSlug: string;

    test('clicking + New Risk opens the modal without navigating away', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/risks`);
        // Reload to clear any Radix focus-trap state left behind by
        // earlier modal-heavy specs in the same Playwright run.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#new-risk-btn', { timeout: 15000 });
        // Click would otherwise race against React hydration of RisksClient.
        await waitForHydration(page);
        const listUrl = page.url();

        await page.click('#new-risk-btn');

        await expect(page.locator('#risk-title')).toBeVisible({ timeout: 60_000 });
        expect(page.url()).toBe(listUrl);

        // Close the modal so it doesn't leak into downstream serial-mode
        // tests (Vaul/Radix leave global focus-trap + overlay state
        // attached to the shared browser context otherwise).
        await page.click('#new-risk-cancel-btn');
        await expect(page.locator('#risk-title')).toBeHidden({ timeout: 5000 });
    });

    test('Submit is disabled until Title is filled', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/risks`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#new-risk-btn', { timeout: 15000 });
        await waitForHydration(page);
        await page.click('#new-risk-btn');
        await expect(page.locator('#risk-title')).toBeVisible({ timeout: 60_000 });

        await expect(page.locator('#submit-risk')).toBeDisabled();
        await page.fill('#risk-title', 'T');
        await expect(page.locator('#submit-risk')).toBeEnabled();
        await page.fill('#risk-title', '');
        await expect(page.locator('#submit-risk')).toBeDisabled();

        // Close the modal so downstream serial-mode tests start with a
        // clean overlay/focus-trap stack.
        await page.click('#new-risk-cancel-btn');
        await expect(page.locator('#risk-title')).toBeHidden({ timeout: 5000 });
    });

    test('Cancel closes the modal and the list stays visible', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/risks`);
        // Reset transient focus-trap / overlay state from previous
        // serial-mode tests; otherwise the new-risk-btn click can be
        // absorbed by a lingering Radix overlay and the modal never
        // mounts.
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#new-risk-btn', { timeout: 15000 });
        await waitForHydration(page);
        await page.click('#new-risk-btn');
        await expect(page.locator('#risk-title')).toBeVisible({ timeout: 60_000 });

        await page.click('#new-risk-cancel-btn');

        await expect(page.locator('#risk-title')).toBeHidden({ timeout: 5000 });
        await expect(page.locator('[data-testid="risks-table"]')).toBeVisible();
    });

    test('submitting creates the risk and the list refreshes', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/risks`);
        await page.waitForSelector('#new-risk-btn', { timeout: 15000 });
        await page.click('#new-risk-btn');
        await expect(page.locator('#risk-title')).toBeVisible({ timeout: 30_000 });

        const uid = Date.now().toString(36);
        const title = `Modal Risk ${uid}`;
        await page.fill('#risk-title', title);
        await page.fill('#risk-description', 'Created via the Epic 54 modal.');

        const [response] = await Promise.all([
            page.waitForResponse(
                (r) =>
                    r.url().includes('/api/t/') &&
                    r.url().endsWith('/risks') &&
                    r.request().method() === 'POST',
            ),
            page.click('#submit-risk'),
        ]);
        expect(response.status(), 'POST /risks succeeded').toBeLessThan(400);

        // Modal closes on success.
        await expect(page.locator('#risk-title')).toBeHidden({ timeout: 10000 });

        // List refreshes — the newly created risk appears. R14 (#443)
        // removed the risks-page search box; the register renders every
        // row (LIST_BACKFILL_CAP, no pagination), so assert directly.
        await expect(page.locator('[data-testid="risks-table"]')).toContainText(
            title,
            { timeout: 15000 },
        );
    });

    test('/risks/new deep link redirects to the list with the modal auto-open', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/risks/new`);

        // After the redirect shim, the URL lands on /risks and the modal
        // auto-opens. The `?create=1` flag is stripped on mount.
        await expect(page.locator('#risk-title')).toBeVisible({ timeout: 15000 });
        await expect(page).toHaveURL(/\/risks(\?|$)/);
    });
});
