import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
// Always use a dedicated port for E2E tests to avoid conflicts with `npm run dev` on 3000.
// This ensures E2E tests always start their own server with AUTH_TEST_MODE=1.
const port = 3006;

export default defineConfig({
    testDir: './tests/e2e',
    globalSetup: './tests/e2e/global-setup.ts',
    // GAP-23: hard-deletes any tenants the suite created via
    // `createIsolatedTenant` (tracked in
    // `tests/e2e/.tenant-tracker.jsonl`). Idempotent — does
    // nothing when the file is absent. Failures don't abort the
    // run; the tracker file is preserved so the next run retries.
    globalTeardown: './tests/e2e/global-teardown.ts',
    timeout: 180_000,
    fullyParallel: false,
    forbidOnly: isCI,
    // BOTH CI and local runs use `next start` (production mode) — a
    // pre-compiled server that handles the full serial suite cleanly.
    // We previously used `next dev` locally, which JIT-compiles routes
    // and leaks memory over long sessions. The 30-ish spec serial suite
    // ran ~38 min and the dev server consistently degraded near the
    // end (ECONNREFUSED, 30-60s selector timeouts on pages that render
    // fine in isolation), producing 2-3 spurious failures per run that
    // 1 retry couldn't recover from because the server stayed slow.
    //
    // `scripts/e2e-local.mjs` already runs `next build` before kicking
    // off Playwright, so the build artifact is always fresh. Direct
    // `npx playwright test` invocations need a prior `npx next build`
    // (without it, `next start` errors out with a clear message).
    //
    // 2 retries on both — local can still hit transient localhost
    // races, but production-mode server eliminates the systematic
    // degradation flakes that were the dominant failure mode.
    retries: 2,
    workers: 1,
    reporter: isCI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: process.env.URL || 'http://localhost:3006',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'on',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
            // The `@mobile` responsive spec asserts phone-viewport layout;
            // it would be meaningless at the desktop 1280px viewport, so the
            // desktop project skips it (the two mobile projects below own it).
            grepInvert: /@mobile/,
        },
        // Mobile viewports — the WCAG/responsive pass (`mobile-responsive.spec.ts`)
        // is tagged `@mobile` and runs here. `Pixel 5` (Android Chrome, 393px)
        // and `iPhone 13` (Mobile Safari, 390px) bracket the common phone
        // breakpoints; both sit under the `md:` (768px) stacking threshold so
        // the location detail map + parcel list verify their single-column
        // mobile layout. Desktop specs aren't re-run here — `grep: /@mobile/`
        // scopes each mobile project to the responsive spec only, so the serial
        // suite doesn't triple in length.
        {
            name: 'mobile-android',
            use: { ...devices['Pixel 5'] },
            grep: /@mobile/,
        },
        {
            name: 'mobile-ios',
            use: { ...devices['iPhone 13'] },
            grep: /@mobile/,
        },
    ],
    webServer: {
        // AUTH_URL / NEXTAUTH_URL must match the actual test port. NextAuth's
        // reqWithEnvURL() rewrites the request origin to AUTH_URL for every
        // /api/auth/* request — any mismatch causes login redirects to land on
        // the wrong host and surfaces as spurious MissingCSRF / stuck-login
        // failures in Playwright.
        // Both CI and local use `next start` (production mode). See the
        // retries comment above for why local stopped using `next dev`.
        // PORT must be set explicitly because `next start -p` doesn't
        // propagate to the env that `auth-config.ts` reads at startup.
        // NEXT_PUBLIC_TEST_MODE=1 is mainly inlined at build time, but
        // keeping it on `next start` too is a belt-and-braces guard in
        // case some part of the runtime re-reads it. Suppresses the
        // Driver.js onboarding-tour auto-trigger so the tour overlay
        // doesn't cover every authenticated page in E2E sessions.
        // DATA_ENCRYPTION_KEY: `next start` overwrites process.env.NODE_ENV
        // to "production" regardless of what cross-env passed in. The Epic B
        // encryption sentinel inside src/instrumentation.ts reads NODE_ENV at
        // runtime and refuses to start a "production" process without a
        // 32+ char DATA_ENCRYPTION_KEY. We seed a default via shell `${VAR:-…}`
        // expansion (NOT cross-env, which would override the value the
        // surrounding env already set) so:
        //   • direct `npx playwright test …` works locally without env wiring
        //   • CI keeps its own `DATA_ENCRYPTION_KEY` (the seed step uses the
        //     same value, so the HMAC-derived `emailHash` matches between
        //     seed and login). Forcing a different value here causes
        //     `unknown_email` login failures because the seed and the
        //     webserver hash `admin@acme.com` under different keys.
        // NOT a real secret; visible in source so no operator confuses it
        // for prod.
        command: `DATA_ENCRYPTION_KEY=\${DATA_ENCRYPTION_KEY:-e2e-deterministic-test-encryption-key-32+-chars} npx cross-env NODE_ENV=test NODE_OPTIONS="--max-old-space-size=4096" NEXT_IGNORE_INCORRECT_LOCKFILE=1 AUTH_TEST_MODE=1 NEXT_TEST_MODE=1 NEXT_PUBLIC_TEST_MODE=1 AUTH_URL=http://localhost:${port} NEXTAUTH_URL=http://localhost:${port} PORT=${port} npx next start -p ${port}`,
        port,
        reuseExistingServer: !isCI,
        timeout: 120_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
