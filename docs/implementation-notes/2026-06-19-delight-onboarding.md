# 2026-06-19 — Guided onboarding (feat/delight-onboarding)

**Commit:** `<sha>` feat/delight-onboarding — guided first-run, sample data, coach-marks

## Design

A new farmer's first five minutes should feel guided, not like a blank
slate. Four independent pieces, layered onto existing primitives:

1. **Empty states** — every key list surface (Locations, Journal, Inventory,
   Tasks, Certification) renders the shared `<EmptyState>` with a one-line
   "why" + a one-tap primary action. The primitive is icon-only (no
   illustration slot), so "illustrated" is a friendly variant icon + warm
   copy. Most surfaces already had this; the gaps were Locations and
   Inventory (missing `primaryAction`).

2. **First-run ring** — `FirstRunCard` mounts above the `AgDashboardStrip`
   grid. It shows a `<ProgressCircle>` over two steps ("map your first
   field" → "log your first job") and self-hides once both are done or the
   operator dismisses it. Critically, completion is **derived from the
   existing `/dashboard/ag` payload** (field = the `first-field-mapped`
   achievement; job = any recent journal entry or assigned task), so the
   card adds no network cost and the ring cannot disagree with reality.

3. **Sample-data mode** — `isSampleData` boolean on the four ag rows a demo
   farm touches (Location, Parcel, LogEntry, InventoryLot). `loadSampleData`
   seeds a small tagged set into the *current* tenant; `clearSampleData`
   soft-deletes exactly those rows. Reversible, idempotent, tenant-scoped.

4. **Coach-marks** — a show-once-per-browser `<CoachMark>` on the map locate
   control and the field-op wizard trigger.

## Files

| File | Role |
|------|------|
| `src/lib/onboarding-steps.ts` | + `FIRST_RUN_STEPS`, pure `firstRunProgress()`, `firstRunDismissKey()` |
| `src/app/t/[tenantSlug]/(app)/dashboard/FirstRunCard.tsx` | the ring + sample-data controls; mounted in `AgDashboardStrip` |
| `src/lib/coach-marks.ts` | show-once localStorage dedupe (mirrors celebrations.ts) |
| `src/components/ui/coach-mark.tsx` | `<CoachMark>` anchored hint (no shadow/animation) |
| `src/app-layer/usecases/sample-data.ts` | `hasSampleData` / `loadSampleData` / `clearSampleData` |
| `src/app/api/t/[tenantSlug]/sample-data/route.ts` | GET/POST/DELETE |
| `prisma/schema/{agriculture,inventory,journal}.prisma` | `isSampleData` flag |
| `prisma/migrations/20260619120000_add_is_sample_data/` | additive ALTER TABLEs |
| `locations/LocationsClient.tsx`, `inventory/InventoryClient.tsx` | empty-state primary actions |
| `locations/[locationId]/page.tsx`, `components/ui/map/MapCanvas.tsx` | coach-mark wiring |

## Decisions

- **First-run completion is data-derived, never a stored checklist.** The
  ring reads booleans off the payload the strip already loaded. No extra
  table, no extra fetch, and it can't drift from the actual data.
- **Sample data writes raw prisma inside `runInTenantContext`, not the
  create usecases.** `createLocation` runs the FREE-plan entitlement gate
  (demo data must never be plan-blocked), `createParcel` demands real PostGIS
  geometry, `createLot` routes the hash-chained ledger — none fit lightweight
  demo rows. Each insert still carries explicit `tenantId` + `isSampleData`,
  is gated by `assertCanWrite`, and is audited.
- **`isSampleData` is an un-indexed boolean.** Low selectivity; it always
  rides the existing tenantId-leading indexes. Verified against
  schema-index-coverage layers A/B.
- **Sample-data routes use `tasks.view`/`tasks.create`, no ROUTE_PERMISSIONS
  entry.** The route isn't under the privileged roots api-permission-coverage
  scans, so a rule there would read as an orphan and fail the guard;
  `requirePermission(...)` still enforces server-side.
- **The FirstRunCard stays visible in a "sample mode" state while sample data
  exists** — loading demo rows makes the farm look set up (which would hide
  the card and its only Clear button), so `hasSample` overrides the
  done/dismissed hide.
- **Coach-mark has no shadow and no entrance animation** — keeps it clear of
  the shadow-discipline + motion-language ratchets and makes it
  reduced-motion-safe by construction. It decides visibility *after* mount to
  avoid an SSR mismatch and a flash for returning users.
