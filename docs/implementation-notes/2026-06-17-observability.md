# 2026-06-17 — Ag observability (see + alert on field workflows)

**Goal:** make the critical ag field workflows observable — visible in
traces, queryable as SLOs, alertable on drift — and give on-call a
runbook for each new alert.

## Design

Three layers, one seam each:

1. **Traces + SLO metric (one wrapper).** OTel span durations are NOT
   exported as metrics (spans → traces only), so an SLO like
   "ag.field-operation p95 < 1s" needs an *explicit* histogram. The new
   `traceAgUsecase(operation, ctx, fn)` in
   `src/lib/observability/tracing.ts` emits BOTH: a `usecase.<operation>`
   span (with `contextAttributes` + `ag.operation`) AND, via
   `recordAgOperationMetrics`, the `ag.operation.{count,duration}`
   instruments. Labels are a bounded set — `ag.operation` (dotted name)
   + `ag.outcome` (success|failure) — never ids. High-cardinality detail
   (ids, doseValue, status) rides the active span mid-body via
   `trace.getActiveSpan()?.setAttributes(...)`.

   Wired onto the five critical usecases:
   `field-operation.markOperationParcel`,
   `yield-record.createYieldRecord`, `inventory.recordInputApplication`,
   `journal.createLogEntry`, `crop-planning.generatePlantings`. Each uses
   the minimal-churn wrapper pattern: public `X(ctx, …)` returns
   `traceAgUsecase('domain.X', ctx, () => XImpl(ctx, …))`, the original
   body moves verbatim into a private `XImpl`.

2. **Ag audit events.** Six freeform `logEvent({ action })` strings
   carry the field-workflow lifecycle into the hash-chained audit log
   (and, for free, the per-tenant SIEM stream — `appendAuditEntry` fans
   into `streamAuditEvent`): `PARCEL_CREATED`, `GEOMETRY_UPDATED`
   (parcel reshape — distinct from a metadata-only `PARCEL_UPDATED`),
   `SPRAY_JOB_STARTED`, `OPERATION_PARCEL_MARKED`,
   `HARVEST_YIELD_RECORDED`, `LEDGER_RECONCILIATION_RUN`. No enum, no
   migration — the ag domain reuses the string-action writer.

3. **Reconciliation as a first-class drift signal.** New
   `reconcileStockLedger(ctx)` usecase wraps the existing
   `verifyStockChain` integrity sweep, surfaced at
   `POST /api/t/:slug/admin/ledger-reconciliation` (gated `admin.manage`,
   tight rate limit). Observability is *hand-rolled* rather than reusing
   `traceAgUsecase`: a reconciliation that RUNS cleanly but DETECTS drift
   (`valid === false`, no throw) is exactly what the
   `AgLedgerReconciliationDrift` alert pages on, so the `ag.operation`
   metric outcome keys on `verification.valid` — a found break records
   `ag_outcome="failure"` (alert fires) while still returning the report
   to the caller (200, not 500). A thrown exception also records failure
   via the `finally`.

### Metric → rule → alert wiring (names are load-bearing)

| Emitted (OTel)                  | Prometheus                                    | Consumed by |
|---------------------------------|-----------------------------------------------|-------------|
| `ag.operation.count` (Counter)  | `ag_operation_count_total`                    | rate / failure-ratio rules, drift alert |
| `ag.operation.duration` (Hist.) | `ag_operation_duration_milliseconds_bucket`   | p95 recording rule + latency SLO |
| labels `ag.operation`,`ag.outcome` | `ag_operation`, `ag_outcome`               | all of the above |
| `job.execution.*` (existing)    | `job_execution_count_total{job_name="weather-pull"}` | weather-ingestion-lag alert + dashboard |

## Files

| File | Role |
|------|------|
| `src/lib/observability/tracing.ts` | new `traceAgUsecase` (span + SLO metric) |
| `src/lib/observability/metrics.ts` | new `recordAgOperationMetrics` (`ag.operation.*`) |
| `src/lib/observability/index.ts` | barrel re-exports `traceAgUsecase`, `recordAgOperationMetrics` |
| `src/app-layer/usecases/field-operation.ts` | span on `markOperationParcel`; `SPRAY_JOB_STARTED` / `OPERATION_PARCEL_MARKED` |
| `src/app-layer/usecases/yield-record.ts` | span on `createYieldRecord`; `HARVEST_YIELD_RECORDED` |
| `src/app-layer/usecases/inventory.ts` | span on `recordInputApplication`; new `reconcileStockLedger` + `LEDGER_RECONCILIATION_RUN` |
| `src/app-layer/usecases/journal.ts` | span on `createLogEntry` (harvest-capable) |
| `src/app-layer/usecases/crop-planning.ts` | span on `generatePlantings` |
| `src/app-layer/usecases/parcel.ts` | `GEOMETRY_UPDATED` on reshape |
| `src/app/api/t/[tenantSlug]/admin/ledger-reconciliation/route.ts` | admin reconciliation endpoint |
| `src/lib/security/route-permissions.ts` | route → `admin.manage` rule for the new endpoint |
| `docs/grafana/ag-operations.json` | 8-panel Grafana dashboard |
| `infra/observability/prometheus/rules/recording-rules.yml` | `inflect_ag_operations` group (rate / failure-ratio / p95) |
| `infra/observability/prometheus/rules/alerting-rules.yml` | `inflect_ag_operations_slo` group (4 alerts) |
| `docs/runbooks/ag-parcel-import-failures.md` | on-call runbook |
| `docs/runbooks/ag-ledger-reconciliation-drift.md` | on-call runbook (compliance-critical) |
| `docs/runbooks/ag-weather-ingestion-lag.md` | on-call runbook |
| `tests/guardrails/ag-audit-event-coverage.test.ts` | locks the 6 audit actions + 6 trace operations |

## Decisions

- **One wrapper, two signals.** Folding the span and the SLO histogram
  into a single `traceAgUsecase` means a future ag usecase gets both by
  changing one line — and can't accidentally ship a span without the
  metric an alert needs.
- **`reconcileStockLedger` doesn't use `traceAgUsecase`.** The semantic
  of "success" differs: for the other five, success = "didn't throw";
  for reconciliation, a clean run that *finds* corruption is the whole
  point of the alert. Hand-rolling the metric (`success = result.valid`)
  is the honest mapping and is documented inline + in the guardrail.
- **`GEOMETRY_UPDATED` split from `PARCEL_UPDATED`.** A boundary move
  changes area, application overlap, and compliance footprint — a
  distinct audit/dashboard event, not a metadata edit. Categorised
  `data_lifecycle`.
- **Guardrail covers both axes.** Ag audit events are freeform strings
  (no enum to enumerate), so the guardrail holds a curated list and
  static-scans `src/app-layer` for each — plus a companion scan that the
  six critical usecases stay wrapped under the exact operation name the
  Prometheus rules query. Both have in-memory mutation-regression proofs.
- **Alerts lean on recording rules.** Latency/failure-ratio alerts query
  the pre-aggregated `job:ag_operation*` rules (cheap at evaluation) and
  carry `runbook_url`s pointing at the three new runbooks.
