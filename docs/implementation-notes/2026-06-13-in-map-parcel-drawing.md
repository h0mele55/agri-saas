# 2026-06-13 — In-map parcel drawing + editing

**Commit:** `<sha> feat(agriculture): in-map parcel drawing + editing`

## Design

The third deferred Feature-1 candidate — the fast-follow to import-first
parcels. Adds hand-drawn parcel authoring on the Location map: draw a new
polygon, reshape an existing one, delete. No schema change — it reuses
the `Parcel` model and the geo helpers.

```
Location detail · Map tab
  ToggleGroup [Select | Draw | Edit]
        │
        ▼
  MapCanvas (mode prop)
   ├─ select → click-to-select (unchanged; terra-draw never loads)
   ├─ draw   → terra-draw polygon → onCreateGeometry(g) → name modal → POST
   └─ edit   → terra-draw select (vertex drag) → onUpdateGeometry(id,g) → PATCH
        │
        ▼
  parcel usecase → ParcelRepository (geo.ts fragments) → PostGIS
        areaHa = ST_Area(geometry::geography)/1e4   [server-derived]
        Location.boundsJson = recompute from ST_Extent
```

terra-draw (MIT) mounts on the underlying MapLibre map via its official
adapter, loaded by a **dynamic import** so it stays out of the bundle for
the read-only / operator / spray-prescription paths and off the SSR
graph. `select` mode is byte-for-byte the old behaviour.

## Files

| File | Role |
| --- | --- |
| `src/lib/db/geo.ts` | + `locationParcelBoundsSql` (ST_Extent → [w,s,e,n]); keeps `ST_*` contained. |
| `src/app-layer/repositories/ParcelRepository.ts` | + `createOne` / `updateOne` / `softDeleteOne` / `getOne` / `boundsForLocation` (areaHa via `areaHectaresSql`). |
| `src/app-layer/usecases/parcel.ts` | `createParcel` / `updateParcel` / `deleteParcel` (+ bounds refresh + audit). |
| `src/app-layer/schemas/geo.schemas.ts` | GeoJSON polygon validation + parcel write schemas. |
| `src/app/api/.../parcels/route.ts` | + `POST` (create). |
| `src/app/api/.../parcels/[parcelId]/route.ts` | `PATCH` (reshape/rename) + `DELETE`. |
| `src/components/ui/map/MapCanvas.tsx` | `mode` + `onCreateGeometry` / `onUpdateGeometry` (terra-draw seam). |
| `src/app/.../locations/[locationId]/page.tsx` | Map-tab mode toolbar + name-on-draw modal + handlers. |
| `tests/guardrails/parcel-authoring-coverage.test.ts` | areaHa-server-derived + terra-draw single-seam + wiring ratchet. |

## Decisions

- **areaHa is server-derived, always.** The write schemas reject a
  client `areaHa`; the repository re-derives it from the geometry via
  `areaHectaresSql` on every create/reshape. A client-settable area would
  desync the displayed hectares from the actual polygon — a compliance
  hazard for spray-rate math. Locked by the ratchet.

- **terra-draw is a single seam.** Only `MapCanvas` imports terra-draw;
  every other surface uses its `mode` / `onCreateGeometry` /
  `onUpdateGeometry` props. Mirrors the Epic-68 react-window discipline —
  the ratchet fails if a second file imports the library.

- **Dynamic import, select-mode untouched.** terra-draw loads only when
  the user enters draw/edit. The operator/read-only and PrescriptionPanel
  paths never pay the bundle cost and never change behaviour.

- **Edit seeds single-Polygon parcels only.** MultiPolygon imports aren't
  vertex-editable in this pass (they can be deleted + redrawn). The edit
  handler debounces vertex drags (700 ms) before PATCHing.

- **Bounds recompute via ST_Extent, not client.** After any shape change
  the Location's cached bbox is recomputed server-side from its parcels
  so the map re-fits correctly — `null` when no parcels remain.

- **No schema change.** Reuses `Parcel` + the Feature-1 geo plumbing, so
  there is no migration and no new RLS surface — `Parcel` already carries
  the tenant-isolation trio.
