# 2026-06-13 — WP-2 per-tenant module gating ("simple mode")

**Commit:** `<sha> feat(agriculture): WP-2 per-tenant module gating`

## Design

A tenant can switch product modules off to simplify the surface they
see. The gate is a single per-tenant row plus one assertion at the
route boundary, mirroring the shape of `assertCanWrite`:

```
TenantModuleSettings { tenantId (unique), enabledModules ModuleKey[] }
        │
        ▼
resolveEnabledModules(row)        ── row === null ⇒ ALL modules (default-on)
        │
        ▼
assertModuleEnabled(ctx, KEY)     ── throws forbidden('module_disabled: KEY')
        │
        ▼
route handler (e.g. frameworks GET, gated behind CERTIFICATION)
```

The load-bearing invariant is **default-on**: a tenant with no
settings row has every module enabled, so gating a route is
backward-compatible until a tenant explicitly saves a restricted list.
An EMPTY saved list is a real restriction (every module off), NOT a
reset to default — `resolveEnabledModules` only falls back to ALL when
the row itself is absent.

Enforcement is server-side only. The admin page edits the stored list;
it does not retroactively hide already-rendered nav. Toggling a module
off gates the API the next time those routes are called.

`ModuleKey` is a Postgres enum (`JOURNAL | INVENTORY | PLANNING |
CERTIFICATION | RISK | VENDORS | AUTOMATION | PROCESSES | AI`) — the
nine product domains the ag-SaaS surfaces. `enabledModules` is a
`ModuleKey[]` array column.

`frameworks/route.ts` (the certification/compliance entry point) is
wired as the demonstration gate behind `CERTIFICATION`. New gated
domains follow the same two-line pattern and register in the coverage
ratchet.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/enums.prisma` | `ModuleKey` enum (9 domains). |
| `prisma/schema/agriculture.prisma` | `TenantModuleSettings` model (tenant-scoped, RLS trio). |
| `prisma/schema/auth.prisma` | `Tenant.moduleSettings` back-relation. |
| `prisma/migrations/20260613140000_module_gating/` | Enum + table + unique index + FK + RLS trio + FORCE. |
| `src/lib/modules.ts` | Pure helpers — `ALL_MODULES`, `MODULE_LABELS`, `MODULE_DESCRIPTIONS`, `resolveEnabledModules`, `coerceModuleKeys`. No DB. |
| `src/app-layer/repositories/ModuleSettingsRepository.ts` | `get` / `upsert` (tenant-scoped). |
| `src/app-layer/usecases/modules.ts` | `getEnabledModules`, `getModuleSettings`, `setEnabledModules`, `isModuleEnabled`, `assertModuleEnabled`. |
| `src/app/api/t/[tenantSlug]/admin/modules/route.ts` | GET/PUT admin API, `requirePermission('admin.manage')`. |
| `src/app/api/t/[tenantSlug]/frameworks/route.ts` | Demonstration gate — `assertModuleEnabled(ctx, 'CERTIFICATION')`. |
| `src/app/t/[tenantSlug]/(app)/admin/modules/page.tsx` | Admin "simple mode" settings page (Switch per module + Save). |
| `src/app/t/[tenantSlug]/(app)/admin/page.tsx` | Admin landing — Modules nav pill. |
| `src/lib/security/route-permissions.ts` | Rule: `/admin/modules` → `admin.manage`. |
| `tests/guardrails/module-gate-coverage.test.ts` | Curated registry — gated routes import + call `assertModuleEnabled`. |

## Decisions

- **Default-on, not default-off.** Gating must never break an existing
  tenant. The absence of a row (the common case) resolves to ALL
  modules — so a route gated today keeps working for every tenant that
  hasn't opted into simple mode. The cost is that "disable a module"
  is the only persisted state; "enable everything" is represented by
  deleting/not-having the row OR saving the full list.

- **Inline Zod schema on the admin route (no `.openapi()`).** The PUT
  body schema is defined inline and `.strip()`-ed rather than
  registered in the OpenAPI surface. This keeps the change off the
  `public/openapi.json` + contract-snapshot regeneration path — module
  gating is an internal admin toggle, not part of the public API
  contract.

- **Curated coverage ratchet, not a structural scan.** Unlike the HIBP
  ratchet (which can detect password-shaped fields structurally),
  "which routes belong to a gated module" is a product decision with
  no source-level signal. The guardrail is therefore a curated
  registry: a route is gated because we list it, and the test holds
  each listed route to the import+call contract. Adding a gate is a
  two-line route change plus one registry entry.

- **`assertModuleEnabled` echoes the key in the error code only.** The
  thrown `forbidden('module_disabled: <KEY>')` surfaces a generic 403
  to the client; the key rides the non-sensitive error code so
  operators can diagnose without leaking authorization internals.

- **Server-enforced, UI-cosmetic.** The page is intentionally thin —
  it edits the list and nothing else. Hiding nav for disabled modules
  is a follow-up; the security boundary is the route-level assertion,
  which is correct regardless of what the UI renders.
