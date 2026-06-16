# 2026-06-16 — Fast-follows: in-map split/merge + reference-data expansion

**Commit:** `<sha>` feat(map): parcel split/merge + reference-data catalog expansion

The "smaller deferred items" round. Of the three candidates, two shipped
(both fully verifiable); the third (offline operator PWA) is deferred with
a recorded rationale. Neither shipped item needed a Prisma schema change or
a new dependency.

## Design

### In-map split / merge (terra-draw was already scaffolded)
The Feature-1 map (`MapCanvas`, maplibre-gl) already had `draw` (new
polygon) and `edit` (vertex reshape) modes via terra-draw, with the
`createParcel` / `updateParcel` / `deleteParcel` usecases + geo.ts PostGIS
helpers behind them. This round adds the two missing GeometryEditor ops —
**split** and **merge** — entirely server-side:

```
MERGE   selected parcels ──union──▶ ST_Union → one new MultiPolygon parcel
                                     (originals soft-deleted)
SPLIT   parcel + drawn line ──cut──▶ ST_Split + ST_Dump → N polygon pieces
                                     (one new parcel each; original soft-deleted)
```

The geometry math is PostGIS, confined to `geo.ts` (the `ST_*`-containment
guardrail holds). The UI adds a `split` LineString mode to `MapCanvas`
(terra-draw `TerraDrawLineStringMode`) and a merge/split toolbar to the
Location detail page; both consume the new tenant-scoped API routes.

### Reference-data expansion (pure seed pipeline)
Three catalog expansions, all reusing the existing importer pattern
(exported fn + CLI + idempotent upsert + provenance comment), no schema
change:
- **Crop varieties** 12→**32 crop types / 80 varieties** (OpenFarm CC0).
- **Products / active-ingredients** — a new `import-products.ts` seeds
  ~22 GENERIC, illustrative input-product archetypes as `Item` rows with
  regulatory metadata (active ingredient, MoA group, REI/PHI, signal word,
  NPK) on `Item.attributesJson` — no schema change.
- **Scheme catalogs** +2 illustrative AG_SCHEME YAMLs (LEAF Marque,
  Red Tractor).

## Files

| File | Role |
|---|---|
| `src/lib/db/geo.ts` | + `lineSql`, `unionParcelsGeoJsonSql`, `splitParcelGeoJsonSql` (ST_* contained) |
| `src/app-layer/repositories/ParcelRepository.ts` | + `unionForLocation`, `splitOne` (tenant/location-scoped raw SQL) |
| `src/app-layer/usecases/parcel.ts` | + `mergeParcels`, `splitParcel` (validate → geom op → create/soft-delete → audit) |
| `src/app-layer/schemas/geo.schemas.ts` | + `MergeParcelsSchema`, `SplitParcelSchema`, LineString schema |
| `.../locations/[id]/parcels/merge/route.ts`, `.../[parcelId]/split/route.ts` | the two POST routes |
| `src/components/ui/map/MapCanvas.tsx` | + `split` mode (LineString blade) + `onCreateSplitLine` |
| `.../locations/[locationId]/page.tsx` | merge modal + split wiring + mode toggle |
| `scripts/import-crop-varieties.ts` | restructured to N varieties/crop; 32/80 |
| `scripts/import-products.ts` | NEW generic product/active-ingredient importer |
| `prisma/catalogs/{leaf-marque,red-tractor}-demo.yaml` | NEW illustrative AG_SCHEME catalogs |
| `tests/integration/parcel-merge-split.test.ts` | real-PostGIS merge/split behaviour |

## Decisions

- **Split/merge are SERVER-side PostGIS, not client turf.js.** `ST_Union`
  / `ST_Split` keep the geometry truth in the DB, reuse the existing
  validation (`ST_IsValid`) + areaHa recompute, and stay inside the
  `geo.ts` containment guardrail. The merge query is tenant- AND
  location-scoped, so a caller can never union across a boundary
  (integration-tested with a foreign id).
- **Merge/split reuse `createOne` + `softDeleteOne`.** A merge creates one
  new parcel from the union and soft-deletes the originals; a split creates
  one parcel per `ST_Dump` piece. No new persistence path — areaHa, bounds
  recompute, and audit all come for free. New audit verbs `PARCEL_MERGED` /
  `PARCEL_SPLIT` (the audit `action` is a free-form string).
- **A blade that doesn't fully cross is rejected** (`< 2` pieces → 400)
  rather than silently no-op'ing.
- **Split-mode selection carry-over.** terra-draw owns the pointer in
  draw/edit/split, so selection is disabled there; entering `split` with
  exactly one parcel selected carries it as the split target (every other
  mode transition clears). This resolves "need a target" vs "selection
  disabled in draw modes".
- **Products use `Item.attributesJson`, no schema change.** The Item model
  already carries `attributesJson` for regulatory metadata; a product
  catalog is pure seed data. Active-ingredient names are public-domain
  generic chemical/biological names; NO proprietary label/brand/MSDS text.
- **Offline operator PWA DEFERRED.** The codebase has no service-worker /
  PWA foundation today, so it's a greenfield build whose headline outcome
  ("an operator completes a job offline and it syncs") can only be honestly
  verified with browser-level offline E2E — not available in this
  environment. Shipping an unverifiable offline-sync would violate the
  "report outcomes faithfully" bar. Recommended as its own focused
  follow-up: a `next-pwa`/workbox shell + an IndexedDB outbox layered on
  the existing `use-optimistic-update` hook + Playwright offline-context
  E2E.
