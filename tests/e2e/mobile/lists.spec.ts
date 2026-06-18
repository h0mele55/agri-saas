/**
 * Mobile lists — DataTable card fallback (@mobile).
 *
 * READ-ONLY (shared seeded tenant via loginAndGetTenant). Proves the
 * mobile-lists contract at a phone viewport (mobile-android / mobile-iphone
 * projects, both <sm):
 *
 *   1. A `mobileFallback="card"` list renders TAPPABLE CARDS instead of a
 *      horizontally-scrolling table — NO horizontal overflow at 390px.
 *   2. Tap-through: a card navigates to the row's detail.
 *   3. The list filters live in a vaul BOTTOM-SHEET on mobile (the "Filter"
 *      button opens a bottom Drawer dialog) — the existing responsive
 *      FilterToolbar (Popover→Drawer), not a hand-rolled sheet.
 *
 * Tasks is the primary subject: `prisma/seed.ts` seeds compliance tasks,
 * the list is card-mode + clickable (→ /tasks/<id>) + has a FilterToolbar.
 * The seeded "Home Farm — Demo" parcels sub-table is a second no-scroll
 * proof on guaranteed data.
 */
import { test, expect, type Page } from '@playwright/test';
import { safeGoto, loginAndGetTenant } from '../e2e-utils';

async function expectNoHorizontalOverflow(page: Page, label: string) {
    const o = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
    }));
    expect(
        o.scrollWidth,
        `${label}: document scrollWidth (${o.scrollWidth}) should not exceed viewport clientWidth (${o.clientWidth}) — horizontal overflow on mobile`,
    ).toBeLessThanOrEqual(o.clientWidth + 1);
}

test.describe('mobile lists — card fallback @mobile', () => {
    let tenantSlug: string;

    test.beforeEach(async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
    });

    test('Tasks render as tappable cards (no horizontal scroll) and tap through to detail', async ({
        page,
    }) => {
        await safeGoto(page, `/t/${tenantSlug}/tasks`);
        const main = page.getByRole('main');
        await expect(
            main.getByRole('heading', { name: 'Tasks', level: 1 }),
        ).toBeVisible({ timeout: 30_000 });

        // The card list (seeded tasks) renders instead of the scrolling table.
        const cardList = main.getByTestId('mobile-card-list');
        await expect(cardList).toBeVisible({ timeout: 30_000 });
        const cards = cardList.getByTestId('mobile-card');
        expect(await cards.count()).toBeGreaterThan(0);

        // PRIMARY GOAL: no horizontal overflow at the phone viewport.
        await expectNoHorizontalOverflow(page, 'tasks list (card mode)');

        // Tap-through: a card navigates to /tasks/<id>.
        await cards.first().click();
        await page.waitForURL(/\/t\/[^/]+\/tasks\/[^/]+/, { timeout: 30_000 });
    });

    test('list filters live in a vaul bottom-sheet on mobile', async ({ page }) => {
        await safeGoto(page, `/t/${tenantSlug}/tasks`);
        const main = page.getByRole('main');
        await expect(
            main.getByRole('heading', { name: 'Tasks', level: 1 }),
        ).toBeVisible({ timeout: 30_000 });

        // The "Filter" trigger opens a vaul bottom-Drawer (role=dialog) on
        // mobile — the Popover→Drawer swap in the shared primitive. The
        // active-filter chip strip (FilterUI.List) sits in the toolbar above
        // the list. The Drawer content portals to <body>, so the dialog
        // assertion is page-scoped (not under <main>).
        await main.getByRole('button', { name: /filter/i }).first().click();
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });
    });

    test('parcels sub-table renders cards with no horizontal scroll', async ({
        page,
    }) => {
        // The seeded "Home Farm — Demo" location has 3 parcels; its parcels
        // tab uses the card fallback (a sub-table inside a detail page).
        await safeGoto(page, `/t/${tenantSlug}/locations`);
        const main = page.getByRole('main');
        await main
            .getByRole('link', { name: 'Home Farm — Demo' })
            .first()
            .click();
        await expect(
            main.getByRole('heading', { name: 'Home Farm — Demo' }).first(),
        ).toBeVisible({ timeout: 30_000 });

        await main.getByRole('tab', { name: 'Parcels' }).click();

        const cardList = main.getByTestId('mobile-card-list');
        await expect(cardList).toBeVisible({ timeout: 30_000 });
        expect(await cardList.getByTestId('mobile-card').count()).toBeGreaterThan(0);
        await expectNoHorizontalOverflow(page, 'parcels sub-table (card mode)');
    });
});
