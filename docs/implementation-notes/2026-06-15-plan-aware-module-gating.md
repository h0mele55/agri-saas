# 2026-06-15 — Plan-aware module gating

**Commit:** `<sha>` feat(modules): plan-aware module gating (available = plan ∧ tenant)

## Design

Module availability gains a second dimension. Before this change (WP-2),
a module was AVAILABLE iff the tenant had it enabled
(`TenantModuleSettings.enabledModules`, default = all). That gates the
"simple mode" toggle but says nothing about billing — a FREE SaaS tenant
could still toggle on every GRC surface.

This change makes availability the **intersection of two dimensions**:

```
available(module) = planAllows(plan, module)  ∧  tenantEnabled(module)
```

- **PLAN half** — `src/lib/entitlements.ts::MODULE_MIN_PLAN` maps each
  `ModuleKey` to the minimum billing tier that unlocks it. A `null` plan
  (self-hosted / billing-unconfigured) allows EVERY module, so on-prem +
  dev + the inherited GRC test/demo tenants are unaffected. The tiering
  follows the two personas:
    - agriculture core (`JOURNAL` / `INVENTORY` / `PLANNING`) → `FREE`
      (the startup farmer's full working surface, == `SIMPLE_MODE_MODULES`),
    - GRC + automation (`CERTIFICATION` / `RISK` / `VENDORS` /
      `AUTOMATION` / `PROCESSES`) → `PRO`,
    - `AI` → `ENTERPRISE`.
- **TENANT half** — unchanged `TenantModuleSettings.enabledModules`
  (default = all). This stays the per-tenant "simple mode" toggle.

`CERTIFICATION` is the **GRC umbrella gate**: every compliance surface
(risks, controls, audits, policies, vendors, processes, frameworks,
clauses, coverage, mapping, findings, access-reviews) gates on it. The
dedicated `RISK` / `VENDORS` / `PROCESSES` module keys remain in the enum
for the module-settings admin UI and future granular gating, but the live
gate is `CERTIFICATION` (ported as-is from the phase-0 design).

Three enforcement surfaces, all gating on **availability** (not just the
tenant toggle):

1. **API** — `assertModuleEnabled(ctx, key)` (`usecases/modules.ts`) now
   calls `isModuleAvailable` (plan ∧ tenant) → `403 module_disabled:<key>`.
   Wired into all 12 GRC list/create route handlers.
2. **Page** — `requireModule(ctx, key)` (`lib/security/require-module.ts`)
   redirects to the dashboard. Wired into 12 route-group `layout.tsx`
   files (one server check covers every nested page).
3. **Nav** — `SidebarNav` hides the 6 GRC nav items
   (risks/controls/audits/policies/vendors/processes) when CERTIFICATION
   is unavailable, resolved server-side in the tenant layout and threaded
   via `TenantProvider.availableModules`.

The tenant layout resolves `availableModules` once
(`getAvailableModulesForTenant` = plan ceiling ∩ tenant toggle) and passes
it to the client. Absent on pre-port providers ⇒ the sidebar degrades
gracefully to "all available" until the session re-mints.

## Files

| File | Role |
|---|---|
| `src/lib/entitlements.ts` | `MODULE_MIN_PLAN` + `planAllowsModule` / `planModules` / `getModuleMinPlan` (pure plan-dimension logic) |
| `src/lib/entitlements-server.ts` | `getAvailableModulesForTenant(tenantId)` — server-side plan ∩ tenant resolver for the layout |
| `src/app-layer/usecases/modules.ts` | `getAvailableModules` / `isModuleAvailable`; `assertModuleEnabled` now plan-aware |
| `src/lib/security/require-module.ts` | NEW — page/layout redirect gate (twin of `assertModuleEnabled`) |
| `src/app/t/[tenantSlug]/(app)/{12 GRC groups}/layout.tsx` | NEW — `requireModule(ctx, 'CERTIFICATION')` per route group |
| `src/app/api/t/[tenantSlug]/{12 GRC routes}/route.ts` | `assertModuleEnabled(ctx, 'CERTIFICATION')` after `getTenantCtx` |
| `src/components/layout/SidebarNav.tsx` | `filterVisible` helper + `visible: certAvailable` on the 6 GRC nav items |
| `src/lib/tenant-context-provider.tsx` | `TenantContextValue.availableModules?: ModuleKey[]` |
| `src/app/t/[tenantSlug]/layout.tsx` | threads `availableModules` via `Promise.all` |
| `tests/guardrails/module-gate-coverage.test.ts` | registry expanded 1 → 12 GRC API routes |

## Decisions

- **Kept main's `null → ALL` default** (did NOT port phase-0's ag-first
  `DEFAULT_MODULES = ALL − CERTIFICATION` flip). Flipping the tenant
  default would have hidden CERTIFICATION from the inherited GRC demo
  tenant (`acme-corp`, no billing account) and broken the inherited GRC
  E2E. The PLAN dimension achieves the ag-first product story *safely*: a
  `null` plan (self-hosted / no billing account) allows everything, so GRC
  E2E + on-prem are untouched; a SaaS `FREE` tenant is plan-blocked from
  GRC. The dual-persona demo seed proves it — `green-acres` (FREE +
  `SIMPLE_MODE_MODULES`) sees only the ag core; `bigfarm-*` (ENTERPRISE +
  ALL) sees everything.
- **Ag-adjusted `MODULE_MIN_PLAN`** vs phase-0 (which put PLANNING/RISK at
  TRIAL). The three `SIMPLE_MODE_MODULES` are all `FREE` so the
  startup-farmer persona's working surface costs nothing and the plan
  tiering matches `isSimpleMode`.
- **`planAllowsModule` is pure** (`@/lib/entitlements`, no DB); the DB read
  (`getTenantPlan`) stays in the server/usecase layer. Keeps the plan
  matrix unit-testable without mocking Prisma and reusable from the Edge.
