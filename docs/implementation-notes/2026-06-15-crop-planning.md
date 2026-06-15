# 2026-06-15 — Crop planning (succession engine + auto-generated field work)

**Commit:** `<sha>` feat(planning): succession planning that auto-generates field work + seed demand

## Design

Succession planning: a `CropPlan` is a *config* (first sow date, N successions,
interval, allocation) that a pure engine expands into dated `Planting` rows,
which in turn auto-generate field `Task`s. Actuals flow back from the journal
(`LogPlanting`) for a plan-vs-actual view.

```
CropVariety(agronomy)  ┐
CropPlan(config) ───────┼─▶ succession.ts (PURE) ─▶ ComputedPlanting[]
                        ┘         │
                                  ▼ generatePlantings (usecase)
                          Planting rows ──▶ createTask + addTaskLink('PLANTING')
                                  ▲
   journal LogEntry ──LogPlanting─┘  (actual sow/transplant/harvest → plan-vs-actual)
```

The math is isolated in `src/lib/planning/succession.ts` — a **clean-room**
reimplementation (Qrop / CropPlanning are GPL; this is derived from
first-principles agronomy, no copied code), with **zero** DB/Prisma coupling so
it is exhaustively unit-tested. The usecase layer is the only place Prisma rows
meet the engine's plain inputs.

## Files

| File | Role |
|---|---|
| `src/lib/planning/succession.ts` | PURE engine — dates / seed grams / plant count / merge defaults (24 tests) |
| `prisma/schema/planning.prisma` + migration | 6 tenant-scoped models + RLS trio (drift-stripped) |
| `src/app-layer/usecases/crop-planning.ts` | CRUD + `generatePlantings` + `getCropPlanProgress` + `listPlantings` |
| `src/app-layer/usecases/journal.ts` + `JournalRepository.ts` | `createLogEntry` gains `plantingLinks` → LogPlanting |
| `src/app/api/t/[tenantSlug]/planning/**` | PLANNING-gated routes (seasons / crop-types / crop-varieties / crop-plans / generate / plantings) |
| `src/app/t/[tenantSlug]/(app)/planning/**` | crop-plans list + detail PlantingBoard (Gantt + plan-vs-actual) + seasons |
| `scripts/import-crop-varieties.ts` | OpenFarm CC0 variety seed (`varieties:import`) |

## Decisions

- **The engine is Prisma-free + pure.** Every function is total and
  deterministic (UTC-exact dates via `addUtcDays`). This is the GPL-safe
  clean-room boundary and what makes the math 100% unit-testable. The usecase
  maps `Decimal`/`Date` Prisma fields onto the plain inputs.
- **CropType/CropVariety are tenant-scoped catalogs** (like `Item`), not a
  global catalog (like `Framework`). Each tenant curates + seeds its own from
  OpenFarm CC0 — simpler than a global catalog + per-tenant override layer, and
  it matches the `Item` precedent. RLS trio on all six tables.
- **Regenerate is idempotent + safe:** `deleteMany status:'PLANNED'` then
  `createMany` — a farmer who has already SOWN succession 1 keeps it; only the
  not-yet-started rows are replaced. Task fan-out idempotency is **batched**
  (one `taskLink.findMany` → a `${plantingId}:${stage}` Set), never a
  read-in-loop.
- **Tasks run outside the plantings tx.** `createTask` opens its own tenant
  context and enqueues a BullMQ notification, so it cannot run inside the raw
  `db` transaction that writes the plantings — the usecase commits plantings
  first, then fans out tasks.
- **Allocation is plan-field-driven, not a Bed model.** `bedLengthM` /
  `rowsPerBed` / `targetAreaM2` on the plan feed the engine's plant-count
  resolver; there is no first-class packed-bed scheduler (deferred).
- **PLANNING is a simple-mode (FREE) module** — the `/planning` surface is NOT
  certification-gated; a startup farmer gets it.
