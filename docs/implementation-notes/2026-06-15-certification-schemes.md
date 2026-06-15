# 2026-06-15 — Certification real (seeded schemes + farm data as evidence)

**Commit:** `<sha>` feat(certification): seeded schemes + auto-evidence + inspection packs

## Design

Phase 7 reseated the compliance domain as ag "Certification" and added the
`AG_SCHEME` Framework kind. Phase 8 makes it *operational*: real scheme
catalogs as data, farm journal records flowing in as Evidence automatically,
and an inspection-prep path (assemble + share an AuditPack, export the SoA).

```
import-schemes.ts ──▶ Framework(AG_SCHEME) + FrameworkRequirement   [global catalog]
                          │  (tenant installs the pack)
                          ▼
                      Control ──ControlRequirementLink──▶ FrameworkRequirement
                          ▲
  spray DONE / journal    │  attachAutoEvidenceFromLogEntry(db, ctx, logEntryId)
  INPUT_APPLICATION ──────┘  Evidence{ sourceLogEntryId, status:SUBMITTED }
                          │
                          ▼  reviewEvidence (human APPROVED)
                      readiness / SoA / AuditPack
```

The whole thing is **reuse**: schemes are `Framework` rows, evidence is the
existing `Evidence`/`EvidenceReview` pipeline, the inspection pack is the
existing `AuditPack`/`freeze`/`AuditPackShare`, and the applicability
statement is the existing SoA (`getSoA` + CSV). The only new persistence is
one nullable scalar FK (`Evidence.sourceLogEntryId`) for auto-evidence
provenance + idempotency.

## Files

| File | Role |
|---|---|
| `prisma/schema/compliance.prisma` + migration | `Evidence.sourceLogEntryId` + index |
| `prisma/catalogs/globalgap-ifa-demo.yaml`, `eu-organic-2018-848-demo.yaml` | concept-only AG_SCHEME catalogs (paraphrased, illustrative) |
| `scripts/import-schemes.ts` | `npm run schemes:import` — loads both catalogs via `applyCatalogFile` |
| `prisma/catalog-loader.ts` | `AG_SCHEME` added to the catalog zod `FRAMEWORK_KINDS` enum |
| `src/app-layer/usecases/auto-evidence.ts` | `AUTO_EVIDENCE_RULES` + `attachAutoEvidenceFromLogEntry` |
| `src/app-layer/usecases/field-operation.ts`, `journal.ts` | auto-evidence hooks (in-tx) |
| `src/app-layer/usecases/scheme-pack.ts` + `schemes/[schemeKey]/pack/route.ts` | inspection-pack assembly (reuses AuditPack) |
| `src/app-layer/usecases/soa.ts` + `schemes/[schemeKey]/applicability.csv/route.ts` | SoA `frameworkKey` option + per-scheme CSV |
| `src/lib/reports/soa-csv.ts` | shared `buildSoACsv` (both SoA routes) |
| `scripts/seed-demo.ts` | import schemes + install GlobalG.A.P. pack + demo spray → auto-evidence |

## Decisions

- **Auto-evidence is SUBMITTED, not APPROVED.** A spray record is auto-
  *collected* as evidence but a human still APPROVES it through the existing
  review state machine — readiness only counts APPROVED, so nothing
  unreviewed silently inflates a scheme's score.
- **Runs in the caller's tenant transaction at the `db` level**, not via the
  `createEvidence` usecase — that usecase opens its own `runInTenantContext`
  and Prisma interactive transactions cannot nest. The spray write + its
  auto-evidence are atomic.
- **Installation is the natural gate.** No CERTIFICATION module check in the
  hook: a tenant without the scheme pack installed has no `ControlRequirementLink`
  to the plant-protection requirements, so the walk finds nothing and no-ops.
  Cheaper and self-correcting.
- **Idempotency on `(sourceLogEntryId, controlId)`** — re-completing a spray
  or re-running the seed never double-mints evidence.
- **Concept-only catalogs.** GlobalG.A.P. IFA checklists are proprietary;
  EU Reg. 2018/848 is public law. Both catalogs use paraphrased generic
  control-point titles + illustrative analogue codes, explicitly marked "not
  the official checklist / not verbatim article text" (LICENSE hygiene).
- **Inspection pack rides the existing `AuditCycle`.** No scheme-native
  inspection-cycle model — the assemble API takes an `auditCycleId`. A
  "start inspection" flow that mints the cycle is a deferred follow-up.
