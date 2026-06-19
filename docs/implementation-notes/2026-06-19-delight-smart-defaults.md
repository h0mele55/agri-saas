# 2026-06-19 — Smart defaults (feat/delight-smart-defaults)

**Commit:** `<sha>` feat/delight-smart-defaults — near-zero-typing field entry

## Design

Anticipate the operator's next action so logging a field job is near-zero
typing. Everything is a SUGGESTION (recency/frequency over existing rows —
no ML, no new schema), one tap to accept, every value editable.

One read usecase, `getLocationSmartDefaults(ctx, locationId)`, derives all
suggestions for a field from rows that already exist:

- **repeatLast** — the latest field operation on the location's parcels,
  regrouped into one repeatable job.
- **byParcel** — last-used product+dose+unit per parcel (recency).
- **defaultUnitId** — most-recently-used RATE unit.
- **sprayWindow** — today's suitability from the latest `WeatherObservation`
  via the existing `evaluateSprayWindow()`.
- **nextPlanting** — soonest future sow/transplant/harvest among the
  location's not-finished `Planting` rows.

The wizard consumes it for prefills; the location page surfaces the
spray-window + next-task banner; the map uses a separate, purely client-side
nearest-field helper on the locate-me fix.

## Files

| File | Role |
|------|------|
| `src/app-layer/usecases/smart-defaults.ts` | recall usecase + `LocationSmartDefaults` types |
| `src/app/api/t/[tenantSlug]/locations/[id]/smart-defaults/route.ts` | GET |
| `src/lib/swr-keys.ts` | `locations.smartDefaults(id)` cache key |
| `src/lib/spatial/nearest.ts` | pure nearest-parcel (bbox centre + haversine) |
| `src/components/ui/map/MapCanvas.tsx` | `onLocationChange` callback (lifts the GPS fix) |
| `.../locations/[locationId]/SprayJobWizard.tsx` | Repeat-last-job + dose/unit prefill |
| `.../locations/[locationId]/SmartDefaultsBanner.tsx` | spray-window + next-task surface |
| `.../locations/[locationId]/page.tsx` | fetch + banner + nearest-field wiring |

## Decisions

- **No new schema.** Recall is a bounded query over `OperationParcel`
  (product/dose/unit/parcel/createdAt already there). `byParcel` +
  `defaultUnitId` + the latest job's taskId all come from ONE cross-parcel
  `findMany` reduced in memory — no per-parcel query (N+1 guard).
- **"Catalog dose defaults" = recall-derived.** No product→dose catalog rule
  exists (Item.defaultUnitId is an inventory unit, not a RATE dose), so the
  dose prefill is "the last dose you used for this product on this field" —
  exactly the sanctioned recency approach, and it degrades to no-prefill on a
  cold start rather than inventing a number.
- **Reuse, don't rebuild, the spray window.** `evaluateSprayWindow()` already
  classifies GOOD/CAUTION/UNSUITABLE from wind/precip/temp; the usecase runs
  the latest observation through it rather than re-deriving thresholds.
- **`onLocationChange` fires on the locate-me tap only**, not on continuous
  live-tracking updates — a deliberate tap shouldn't be followed by the map
  re-selecting fields out from under the operator as they walk.
- **Nearest-field uses `@turf/bbox` + haversine, not `@turf/centroid` /
  `@turf/distance`** (those packages aren't installed; adding deps would drag
  in audit/Trivy/lockfile churn). A bbox centre is more than precise enough to
  rank a handful of parcels.
- **All applied values are editable suggestions.** "Repeat last job" fills the
  whole form but the operator still walks (or skips) each step; the dose
  suggestion only fills when they haven't typed one.
