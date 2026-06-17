# 2026-06-17 — Data integrity: geometry, ledger, unit math

**Goal:** make the three figures with regulatory + financial stakes —
parcel acreage, the stock ledger, and spray dose math — correct by
construction and continuously reconciled.

## Design

### 1. Geometry validity / repair (`src/lib/db/geo.ts`, `ParcelRepository`)
PostGIS `ST_GeomFromGeoJSON` accepts self-intersecting polygons that then
produce a meaningless `ST_Area`. The write path now REPAIRS before it
persists:

- `repairedGeometrySql` = `ST_Multi(ST_CollectionExtract(ST_MakeValid(…), 3))`
  — MakeValid resolves the self-intersection, CollectionExtract keeps only
  the POLYGON components (a bowtie can yield a GEOMETRYCOLLECTION), Multi
  normalises to the column type. `ParcelRepository.createOne / updateOne /
  replaceForLocation` use it + `areaHectaresNonNullSql` (COALESCE→0), so a
  parcel with a geometry can NEVER carry a NULL or garbage `areaHa`.
- Migration `parcel_geometry_integrity` repairs + backfills EXISTING rows
  in-SQL, then adds a CHECK: `geometry IS NULL OR areaHa IS NOT NULL`.
- `scripts/validate-parcel-geometries.ts` — operator backfill (`--dry-run`
  flags, `--apply` repairs; idempotent).
- `src/lib/geo/polygon-validity.ts` — a pure, client-safe self-intersection
  check; `MapCanvas` calls it for an optimistic preview hint. The server's
  ST_MakeValid/ST_IsValid stays the authority.
- All `ST_*` stays contained in `geo.ts` (the containment guardrail);
  migration DDL is exempt.

### 2. Ledger reconciliation + idempotency
- **Idempotency (two layers).** `StockTransaction.idempotencyKey` + a
  PARTIAL unique index `(tenantId, idempotencyKey) WHERE … IS NOT NULL`.
  `appendStockTransaction` short-circuits a repeated key to a no-op
  (race-safe — it already holds the per-tenant advisory lock).
  `recordInputApplication` (a) early-returns if an `INPUT_APPLICATION` log
  already exists for the `operationParcelId`, and (b) keys the CONSUMPTION
  on `spray:<operationParcelId>` (the STABLE source, never the per-call
  `logEntryId`). A retry/double-click/replay can't double-deduct.
- **Reconciliation.** `verifyLotBalances` asserts every lot's denormalised
  `quantityOnHand` cache equals the authoritative `SUM(quantityDelta)`
  (canonical 4dp string compare). The daily cross-tenant BullMQ job
  `reconcile-inventory-ledgers` runs it alongside `verifyStockChain` (hash
  integrity), logs drift with the offending lots, and feeds the SAME
  `ag.operation`=`inventory.reconcileStockLedger` FAILURE metric the
  on-demand admin reconcile uses — so one `AgLedgerReconciliationDrift`
  alert covers both.

### 3. Unit-conversion correctness (`src/lib/units/unit-conversion.ts`)
A typed, dependency-free layer keyed by the canonical `Unit.key` slugs.
Bases are chosen so catalog factors are EXACT integers (WEIGHT→g,
VOLUME→mL, AREA→m²): `kg→g` and `L→mL` carry no float drift. `convert`
throws across dimensions (`kg→L` can't silently succeed); `applyRate`
resolves a RATE as numerator/denominator so `L/ha × ha = L` is
dimensionally checked. Wired into the spray dose math with a safe
fallback to the legacy multiply when a unit isn't in the catalog (so
unregistered/TAG-test units keep working).

### 4. Migration-safety guardrail
`ag-ledger-migration-safety.test.ts` scans `prisma/migrations/**` and
fails CI on: a DROP of a ledger table, a DROP of an integrity column
(hash chain / balances / idempotency), a DROP of a protected
trigger/constraint/index without a same-file recreate, or the
establishing CREATE of any guarantee going missing. Forward-only repo,
so this is the "reversibility" backstop: integrity can't be silently
removed.

## Files

| File | Role |
|------|------|
| `src/lib/db/geo.ts` | `repairedGeometrySql` / `…ColumnSql` / `areaHectaresNonNullSql` / `isValidGeometryColumnSql` |
| `src/app-layer/repositories/ParcelRepository.ts` | write paths repair + non-null area |
| `prisma/migrations/20260617181000_parcel_geometry_integrity/` | repair+backfill+CHECK |
| `scripts/validate-parcel-geometries.ts` | operator backfill/repair |
| `src/lib/geo/polygon-validity.ts` + `MapCanvas.tsx` | client preview |
| `src/lib/inventory/stock-ledger.ts` | idempotencyKey + `verifyLotBalances` |
| `prisma/migrations/20260617180000_stock_transaction_idempotency/` | column + partial unique index |
| `src/app-layer/usecases/inventory.ts` | idempotency guards + typed dose math |
| `src/app-layer/jobs/reconcile-inventory-ledgers.ts` (+ types/executor/schedules) | daily reconcile job |
| `src/lib/units/unit-conversion.ts` | typed conversions + dimensional analysis |
| `tests/guardrails/unit-conversion-dimensional-analysis.test.ts` | L/ha×ha=L, kg→g exact, kg→L throws |
| `tests/guardrails/ag-ledger-migration-safety.test.ts` | migration integrity ratchet |
| `tests/integration/ledger-reconciliation.test.ts` | reconcile-to-zero + idempotency + drift |

## Decisions

- **Repair on WRITE, not just validate.** The usecase still rejects
  egregiously invalid input, but the persisted geometry is always
  ST_MakeValid'd — defence in depth so `areaHa` is meaningful even if the
  gate is ever bypassed.
- **Idempotency key on the STABLE source.** `spray:<operationParcelId>`,
  never `logEntryId` (which a retry re-mints). The `logEntryId` in the
  prompt's `(operationParcelId+logEntryId)` can't dedup retries; the
  operationParcel is the one stable identity.
- **Reconcile reuses the existing drift alert.** The daily job emits the
  same `inventory.reconcileStockLedger` failure metric as the admin
  reconcile, so no new alert wiring — the observability epic's
  `AgLedgerReconciliationDrift` fires for both.
- **Dose math falls back, never throws.** Guards (`isRateUnit` /
  `canConvert`) keep the conversion helpers from throwing on a spray; an
  unregistered unit reverts to the legacy multiply, so the change can't
  break an existing tenant's data.
