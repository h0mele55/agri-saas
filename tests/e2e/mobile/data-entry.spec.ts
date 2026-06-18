/**
 * Mobile data-entry — Spray job StepWizard (@mobile).
 *
 * READ-ONLY (shared seeded tenant). The "New spray job" StepWizard
 * (mobile-data-entry PR-4) walks a field operator through
 * parcel → product → rate → confirm, with an OFFLINE-queued submit
 * (useOfflineSync). Proves the launch + step navigation on real seeded
 * data:
 *   1. The "Spray job" button on the seeded location opens the wizard as a
 *      bottom drawer with step 1 (parcel picker) + progress dots.
 *   2. Next is gated until a parcel is picked, then advances to step 2.
 *
 * The wizard's Next/Back/Finish + the OFFLINE-queued completion are unit-
 * tested at the primitive level (tests/rendered/mobile-data-entry.test.tsx
 * covers the StepWizard's queued state); the product/rate steps need seeded
 * product Items + RATE units that the shared tenant doesn't carry, so the
 * full chain isn't driven here to keep this spec robust.
 */
import { test, expect } from '@playwright/test';
import { safeGoto, loginAndGetTenant } from '../e2e-utils';

const SEEDED_LOCATION = 'Home Farm — Demo';

test.describe('mobile data-entry — spray job wizard @mobile', () => {
    let tenantSlug: string;

    test.beforeEach(async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
    });

    test('the Spray job wizard launches and steps through the parcel picker', async ({
        page,
    }) => {
        await safeGoto(page, `/t/${tenantSlug}/locations`);
        const main = page.getByRole('main');
        await main.getByRole('link', { name: SEEDED_LOCATION }).first().click();
        await expect(
            main.getByRole('heading', { name: SEEDED_LOCATION }).first(),
        ).toBeVisible({ timeout: 30_000 });

        // Launch the offline-capable spray-job wizard.
        await page.getByTestId('new-spray-job').click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible({ timeout: 15_000 });

        // Step 1: parcels — heading, progress dots, ≥1 large-tap-target row.
        await expect(
            dialog.getByRole('heading', { name: 'Which parcels?' }),
        ).toBeVisible();
        await expect(dialog.getByTestId('wizard-progress')).toBeVisible();
        const firstParcel = dialog.locator('label[for^="spray-parcel-"]').first();
        await expect(firstParcel).toBeVisible();

        // Next is gated until a parcel is picked.
        await expect(dialog.getByTestId('wizard-next')).toBeDisabled();
        await firstParcel.click();
        await expect(dialog.getByTestId('wizard-next')).toBeEnabled();

        // Advance → step 2 (product); Back becomes available.
        await dialog.getByTestId('wizard-next').click();
        await expect(
            dialog.getByRole('heading', { name: 'Which product?' }),
        ).toBeVisible({ timeout: 15_000 });
        await expect(dialog.getByTestId('wizard-back')).toBeEnabled();
    });
});
