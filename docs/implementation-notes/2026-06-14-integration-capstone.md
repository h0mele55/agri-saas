# 2026-06-14 — Integration capstone (two personas, one product)

**Commit:** `feat(integration): simple-mode vs enterprise, entitlements re-key, persona onboarding, dual-persona demo seed`
**Branch:** `feat/integration` (built on `feat/knowledge-base`).

## Design

The five ag features (spray map, journal, inventory, farm tasks, knowledge)
already shared the IC chassis. This capstone makes them ONE coherent product
for two personas, almost entirely by wiring existing systems:

```
  startup farmer (simple mode)            large grain producer (enterprise)
  ─────────────────────────────           ──────────────────────────────────
  TenantModuleSettings = SIMPLE_MODE       modules = ALL ; Organization (hub)
   (JOURNAL/INVENTORY/PLANNING)             → child farm tenants (spoke)
  BillingAccount.plan = FREE               plan = ENTERPRISE (unlimited)
   → user ≤ 3, location ≤ 5                org-dashboard portfolio (RGL widgets)
  ag dashboard card strip                  ag strip + GRC cards
```

- **Module gating IS the "simple mode" mechanism** (no new flag): a tenant
  saves a curated `enabledModules` list and `useNavSections` hides everything
  else. `SIMPLE_MODE_MODULES` (modules.ts) is the startup-farmer preset;
  `isSimpleMode()` recognises it.
- **Entitlements re-keyed** to the resources that separate the personas:
  `GatedResource` gains `user` + `location` (FREE: 3 users / 5 fields; PRO/TRIAL:
  25/50; ENTERPRISE: unlimited). `assertWithinLimit` is wired at `createLocation`
  and `createInviteToken`. Self-hosted/dev resolves to ENTERPRISE so the caps
  only bite in SAAS mode — exactly the GAP-18 contract.
- **Persona onboarding** extends the Driver.js tour (`onboarding-steps.ts`) with
  ag-focused steps. The runtime `filterStepsForCurrentPage` already drops steps
  whose nav anchor is absent, so the SAME step set adapts per persona
  automatically (a simple-mode farmer never sees the certification step);
  `getTourStepsForPersona()` is the explicit selector.
- **Dual-persona demo seed** (`scripts/seed-demo.ts`, `npm run seed:demo`):
  one startup farm + a BigFarm Co Organization with three child farms,
  exercising the hub-and-spoke. Reuses `createTenantWithOwner`, `setEnabledModules`,
  `createLocation`, `createLot`, `importUnits`, `importKnowledge`; uses direct
  prisma for the journal entry + farm task (the seed convention — avoids the
  createTask BullMQ enqueue that hangs without Redis) and force-exits.
- **Ag dashboard card strip** on the tenant dashboard (recent journal / low
  stock / my farm tasks), gated by enabled modules — the hardcoded-card pattern
  the tenant dashboard already uses (the configurable react-grid-layout widget
  system stays at the ORG level, serving the enterprise portfolio).

## Files

| File | Role |
|------|------|
| `src/lib/billing/entitlements.ts` | `GatedResource += user, location`; `PLAN_LIMITS`; `getCurrentCount` arms |
| `src/app-layer/usecases/location.ts` | `assertWithinLimit(ctx, 'location')` gate |
| `src/app-layer/usecases/tenant-invites.ts` | `assertWithinLimit(ctx, 'user')` gate |
| `src/lib/modules.ts` | `SIMPLE_MODE_MODULES` + `isSimpleMode` |
| `src/lib/onboarding-steps.ts` | ag-focused, persona-adaptive tour + `getTourStepsForPersona` |
| `scripts/seed-demo.ts` + `package.json` | the dual-persona demo seed + `seed:demo` |
| `src/app/.../dashboard/` (+ `api/.../dashboard/ag`) | ag card strip (recent journal / low stock / my tasks) |
| `tests/unit/billing/entitlements.test.ts` | user/location limit coverage |

## Manual verification log

**Demo seed** (`npm run seed:demo`) — exit 0, idempotent, clean exit:

```
✅ Green Acres (green-acres) — modules: [JOURNAL, INVENTORY, PLANNING], plan: FREE
✅ Organization: BigFarm Co (bigfarm-co)
✅ BigFarm — North/South/East Estate — modules: [ALL 9], plan: ENTERPRISE
✅ Org admin admin@bigfarm.demo provisioned across 3 child farms
🎉 Demo seed complete.
```

Per-tenant data (DB-verified): each of the 4 farms has 1 location, 1 inventory
lot (+1 hash-chained ledger row), 1 journal entry, 1 farm task, 6 CC0 knowledge
guides. `Organization bigfarm-co` → 3 child farms (hub-and-spoke).

**Persona 1 — startup farmer** (`farmer@greenacres.demo` → `/t/green-acres`):
`TenantModuleSettings.enabledModules = {JOURNAL, INVENTORY, PLANNING}`. Module
gating (`module-gate-coverage` guard, green) means the nav + the page/API gates
expose ONLY Journal, Inventory, Crop Planning, Farm Tasks (ungated), and
Knowledge (ungated) — no certification/risk/vendor/automation chrome. The ag
card strip shows their recent journal entry, low-stock item, and task. Core
flows (create journal entry, receive stock, assign a task, read+acknowledge a
guide) are wired and integration-tested.

**Persona 2 — enterprise** (`admin@bigfarm.demo` → `/org/bigfarm-co`): the
ORG_ADMIN sees the portfolio of 3 child farms via the org dashboard (react-grid-
layout widgets). Each child farm has the full module surface. Opening any farm
(e.g. `/t/bigfarm-north`) shows the complete nav + ag data.

**Entitlements:** `user`/`location` caps verified by unit tests
(FREE 3/5; PRO 25/50; ENTERPRISE unlimited); gates short-circuit to unlimited
in self-hosted/dev, enforce in SAAS mode.

**Automated checks:** tsc 0. Targeted suites green — billing/entitlements,
control-mutations, modules, onboarding-tour (structural + helpers + automation),
invite-redemption/routes/email, entitlements/entitlements-server,
location-adjacent. Structural guardrails green — codebase-hygiene meta-ratchet,
logging-import-hygiene, module-gate-coverage, no-legacy-admin-guard, no-secrets,
no-explicit-any (both), rls-coverage, api-permission-coverage, async-params,
contract-drift. Design-system ratchets green for the dashboard strip.

## Decisions

- **Wire, don't rebuild.** Simple mode = an existing module-settings list;
  persona tour = the existing anchor-filter; the demo = the existing
  `createTenantWithOwner` + org hub-and-spoke. The only new mechanism is the two
  entitlement resources.
- **Direct-prisma in the seed for side-effecty entities** (task, journal) —
  matches `prisma/seed.ts`; the usecases are covered by integration tests, and
  the seed must run without Redis.
- **Ag dashboard = hardcoded cards, gated by modules** (Option A), not a new
  tenant-level RGL widget system (Option B, a major refactor). The enterprise
  RGL portfolio already exists at the org level.
