# ag-saas — MEMORY (latest status)

**Repo:** `agri-saas` (the product), built ON the inflect-compliance (IC) chassis.
**Updated:** end of Phase-0 platform extraction (module gating).
**Active branch:** `feat/phase0-platform` (pushed; **not yet merged to main**).

## Product (1-liner)
Enterprise agriculture-management SaaS on the IC chassis. Moat = a repurposed
compliance/certification engine (audit-ready spray/harvest records;
GlobalG.A.P. / EU-organic / Red Tractor / CAP). Two personas: smallholders →
large grain producers.

## Chassis (kept as-is)
IC = Next 16 / React 19 / Prisma 7 / Postgres-RLS multi-tenancy, hash-chained
audit, BullMQ, Stripe entitlements, S3+ClamAV, SSO, OTel, i18n, guardrail CI.
The compliance domain is **repurposed + module-gated** (NOT deleted).

## Built so far (all merged except Phase 0)
- **Feature 1 — spray-prescription map**: upload boundaries → parcels on a map →
  assign spray products/dosages → operators execute. `agriculture.prisma`
  (Unit/Item/Location/Parcel/OperationParcel); `src/lib/spatial/parse.ts`;
  `src/lib/db/geo.ts`; migration `…_ag_feature1_spray_map`.
- **Feature-1 follow-ups**: module-gating scaffold, inventory ledger +
  stock-deduction, in-map parcel drawing (terra-draw), offline operator PWA.
- **Dependency modernization**: production group (37 pkgs), visx 3→4,
  typescript 6, dev-deps. eslint 10 blocked upstream (Next-16 ESLint preset).
- **CodeQL security-and-quality cleanup**: 40 → 0 (FPs dismissed). Secret-scan
  alerts were test fixtures (excluded via `.github/secret_scanning.yml`).
- **Phase 0 — module gating** (THIS session, `feat/phase0-platform`, PUSHED).

## Phase 0 (this session) — what + where
Resolution: **available = (plan allows) ∧ (tenant enabled)**.
- Plan half: `src/lib/entitlements.ts` — `MODULE_MIN_PLAN`, `planAllowsModule`,
  `planModules`. A `null` plan (self-hosted / billing-unconfigured) allows all.
- Tenant half: `src/app-layer/usecases/modules.ts` — `getEnabledModules` via
  `runInTenantContext` + `TenantModuleSettings`.
- Combined: `getAvailableModules` / `isModuleAvailable` (usecase) +
  `getAvailableModulesForTenant` (`entitlements-server.ts`, for nav).
- **Default flip**: `src/lib/modules.ts` `DEFAULT_MODULES = ALL − CERTIFICATION`
  → a fresh tenant (no settings row) is ag-first; flipping CERTIFICATION on
  restores the full GRC surface.

Gates:
- **API**: `assertModuleEnabled(ctx,'CERTIFICATION')` on the 12 GRC **entry**
  routes (controls, clauses, coverage, frameworks, mapping, policies, audits,
  findings, risks, vendors, access-reviews, processes).
- **Page**: one route-group `layout.tsx` per GRC group →
  `requireModule()` (`src/lib/security/require-module.ts`; redirects to
  dashboard). Covers every nested page in the group.
- **Nav**: `availableModules` resolved server-side in the tenant layout
  (`src/app/t/[tenantSlug]/layout.tsx`), threaded via `TenantProvider` →
  `useNavSections` hides the 6 GRC nav items (risks, controls, audits, policies,
  vendors, processes). Shared surfaces stay ungated.
- **Guardrail**: `tests/guardrails/module-gate-coverage.test.ts` (12 routes).
- **Seed**: `scripts/seed-demo-farm.ts` (`npm run seed:farm`) — Green Acres Farm
  demo tenant + Location + input-product Items; reuses `scripts/import-units.ts`
  (UOM, `npm run import:units`).

**Verified:** tsc 0; `rls-coverage` + `module-gate-coverage` green; demo tenant
resolves CERTIFICATION-off (0 module rows); seeds run.

## Dev DB (native PostGIS — Docker registry may be blocked)
PostgreSQL 16 + `postgresql-16-postgis-3` installed; cluster `16/main`.
- Start: `sudo pg_ctlcluster 16 main start` (it can go **down on container idle**
  — just restart it).
- db `inflect_compliance` + role `app_user` + `CREATE EXTENSION postgis`.
- `.env` `DATABASE_URL` / `DIRECT_DATABASE_URL` → `127.0.0.1:5432` (postgres
  superuser in dev; RLS bypassed in dev, enforced via `runInTenantContext`).
- **Prisma 7 gotcha:** CLI does NOT auto-load `.env` →
  `set -a && . ./.env && set +a && npx prisma <cmd>`.
- Validate: `prisma migrate deploy` (151 migrations); `prisma generate`;
  `jest tests/unit/spatial-parse.test.ts` (14 pass); `tsc --noEmit` (0).

## House rules (non-negotiable)
- New tenant-scoped table (`tenantId`) ⇒ RLS trio (`tenant_isolation` +
  `tenant_isolation_insert` + `superuser_bypass` + `FORCE`) in its migration, or
  `rls-coverage` fails. Global catalogs (no `tenantId`, e.g. `Unit`) get none.
- Reuse IC patterns; the **Assets module** (`usecases/asset.ts`,
  `app/api/t/[tenantSlug]/assets/`, `app/t/[tenantSlug]/(app)/assets/`) is the
  end-to-end template (usecase→repo→Zod→DTO→route→ListPageShell/EntityDetailLayout).
- Client data via `useTenantSWR`/`useTenantMutation` + `makeResource()`
  (`src/lib/swr-keys.ts`).
- `logEvent` (`app-layer/events/audit.ts`) on every state change; audit-event guardrail.
- All `ST_*` SQL stays in `src/lib/db/geo.ts`; `shpjs` needs
  `globalThis.self = globalThis` server-side (see `parse.ts`).
- Migrations: `prisma migrate dev --create-only` → hand-edit (drop unrelated
  drift + add RLS) → `prisma migrate deploy`.
- **LICENSE:** never copy GPL/AGPL (farmOS, LiteFarm, ERPNext, Ekylibre,
  Nekazari-core) — concept only. Port MIT/Apache/BSD/CC0 (InvenTree, HortusFox,
  OFBiz, Tania, MapLibre/terra-draw/shpjs/togeojson, OpenFarm) with attribution
  in `THIRD_PARTY_NOTICES.md` (NOT yet created — make on first port).

## Next (MVP core — expected build prompts)
Locations/Fields on the map · Farm Journal (farmOS ontology, reimplement;
HortusFox photo-log UX) · Ag Tasks · Basic Inventory (InvenTree UI on the
existing ledger) · Weather feed · Onboarding + simple-mode + PWA field entry.

## Open follow-ups / deferrals
- `feat/phase0-platform` **not yet merged** — open a PR + merge when ready.
- **Vocabulary pass deferred** (nav brand is a hardcoded string, not
  `common.appName`; defer with the Prisma model renames).
- API gating is per **entry route** (the 12 list endpoints); sub-routes rely on
  the page + nav gates. Exhaustive sub-route API gating is a follow-up if needed.
- Nav module resolution uses a raw prisma read (RLS-correct under the dev
  superuser; under prod `app_user` it falls back to `DEFAULT_MODULES` — page/API
  gates stay RLS-correct via `runInTenantContext`). Revisit for prod nav fidelity.
- `THIRD_PARTY_NOTICES.md` to be created on first MIT/Apache/BSD/CC0 port.
