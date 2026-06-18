# 2026-06-18 — Mobile shell PR-1: one-thumb bottom-tab navigation

**Commit:** `<sha> feat(mobile-shell): one-thumb bottom-tab navigation`

First of a 6-PR initiative to take the whole platform mobile (responsive
web + PWA on the existing Next.js app). This PR delivers the foundation:
field users reach the top sections with their thumb, no hamburger drawer.

## Design

A sticky **bottom-tab bar** (`md:hidden`, `fixed inset-x-0 bottom-0
z-30`) gives single-tap reach to the five most-used field surfaces.
It is NOT a second hard-coded nav list — `BottomTabBar` resolves its
tabs against the LIVE, permission-/module-gated `useNavSections()` (the
same source the sidebar + drawer render from), matching by href SUFFIX
(robust to the `/t/<slug>` prefix `tenantHref()` bakes in). A surface
gated out of `useNavSections` drops from the bar automatically — the bar
can never out-run the sidebar's visibility. The five targets:

  /dashboard · /farm-tasks · /locations · /journal · /tasks

The hamburger `MobileDrawer` is untouched — it stays as the long tail.

Mounted in `AppShell` for the **tenant variant only** (`useNavSections`
reads tenant context; the org console is a desktop-admin surface). A
`md:hidden` safe-area spacer (`h-[calc(3.5rem+env(safe-area-inset-bottom))]`,
`data-testid="bottom-tab-spacer"`) is appended to the scroll container so
page content scrolls clear of the fixed bar + the device home indicator.
`viewport-fit=cover` was already set on the root viewport; `.safe-area-bottom`
already existed in globals.css — both reused, not reinvented.

**a11y:** `<nav aria-label="Primary">`; each tab a ≥44px touch target
(WCAG 2.5.5); `aria-current="page"` on the active tab (non-visual cue);
and a top accent bar on the active tab so the active state is never
colour-only (WCAG 1.4.1). Icons `aria-hidden`.

**Top header (bullet 3):** already satisfied by the existing R14-PR12
`NavBar` — a sticky (`sticky top-0 z-30`), condensed, always-on chrome
surface (brand · env badge · notifications · user menu) that is
geometry-/import-guardrail-locked. Page title + the page's one primary
action render on mobile via each page's `PageHeader` directly beneath the
sticky bar. The tenant switcher stays `hidden sm:inline-flex` by the
deliberate R14-PR12 decision (avoid crowding the bell+avatar at 375px;
switching stays reachable via the user menu → `/tenants`). No guarded
chrome was churned for PR-1.

## Files

| File | Role |
| --- | --- |
| `src/components/layout/BottomTabBar.tsx` | New. Resolves 5 gated tabs from `useNavSections()`; renders the fixed `md:hidden` bar. |
| `src/components/layout/AppShell.tsx` | Mounts `<BottomTabBar/>` (tenant variant) + the safe-area spacer. |
| `playwright.config.ts` | Adds the `mobile-iphone` (iPhone 13 viewport) project beside `mobile-android` (Pixel 5); both `@mobile`, both Chromium engine. |
| `tests/e2e/mobile/nav.spec.ts` | New `@mobile` smoke: bar visible + pinned, 5 tabs, 44px, aria-current, tap-to-navigate, spacer clearance. |
| `tests/e2e/mobile-responsive.spec.ts` | Docblock updated for the two-device matrix. |
| `tests/rendered/bottom-tab-bar.test.tsx` | New unit: tab resolution/order/exclusion, active cue, empty-when-all-gated. |

## Decisions

- **Tabs derived from `useNavSections()`, not a parallel list.** Keeps the
  bar permission-/module-gated for free and impossible to drift from the
  sidebar. Suffix-matching tolerates the tenant-slug href prefix.
- **iPhone 13 profile runs on the Chromium engine.** The prompt asked for
  `devices['iPhone 13']` + `devices['Pixel 5']`. Pixel 5 already existed
  (`mobile-android`); iPhone 13 is added as `mobile-iphone` using the real
  iPhone viewport / touch / deviceScale / UA but with `browserName:
  'chromium'`. Reason: ALL e2e auth goes through the client-rendered
  `/login` form (`loginAndGetTenant` ← `signInAs`), which does NOT hydrate
  under the Linux WebKit build in CI (credentials form gated on a
  post-hydration effect) — so no spec can authenticate under WebKit. The
  Chromium-engine iPhone profile verifies one-thumb nav at exact iPhone-13
  metrics while keeping CI green; `isMobile`/`hasTouch` are Chromium-
  supported. **Deferred:** real-Safari/WebKit coverage, pending a `/login`
  hydration fix under Linux WebKit — a natural mobile-hardening (PR-6) item;
  at that point the engine override + a `webkit` CI install restore it.
- **Top header left as the existing NavBar.** It already meets "sticky,
  condensed, on mobile"; duplicating it would fight the
  `r14-nav-bar-*-discipline` guards and the documented `hidden sm:` switcher
  decision for no real gain in PR-1.
- **Spacer element, not padding.** A real `md:hidden` spacer div avoids any
  Tailwind padding-cascade ambiguity against the content container's
  existing `p-4 md:p-6`, and gives the e2e a concrete clearance assertion.
