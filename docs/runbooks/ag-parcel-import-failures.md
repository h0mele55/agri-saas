# Runbook — Ag Parcel / Spatial Import Failures

> Fires from `AgFieldOperationLatencyHigh` and `AgOperationFailureRateHigh`
> (`infra/observability/prometheus/rules/alerting-rules.yml`, group
> `inflect_ag_operations_slo`). Also the landing page when the BullMQ
> `spatial-import` job is failing.
>
> First-look dashboard: **inflect-compliance — Ag Field Operations**
> (`docs/grafana/ag-operations.json`, UID `inflect-ag-operations`).

---

## Trigger

- `AgFieldOperationLatencyHigh` — `field-operation.markOperationParcel`
  p95 above the 1s SLO for 10m.
- `AgOperationFailureRateHigh` — any `ag_operation` failing above 5% for
  10m (commonly `field-operation.markOperationParcel`,
  `crop-planning.generatePlantings`).
- Operator report: spatial uploads stuck, parcels not appearing, the
  `spatial-import` BullMQ job draining slowly or erroring.

## What it means

A spatial / parcel import is failing or running slow. The usual causes:

- **413 (payload too large)** — the uploaded shapefile/GeoJSON exceeds
  the per-format size cap.
- **422 (unprocessable)** — invalid or self-intersecting geometry; the
  topology validation **fails closed** (a bad geometry is rejected, never
  silently repaired).
- **Worker saturation** — the `spatial-import` job backs up behind a slow
  parse (large multipolygon, dense vertex count), pushing
  `markOperationParcel` p95 over SLO because parcel resolution waits on
  the import.

The fail-closed posture is intentional: a parcel with broken topology
must never enter the system, because every downstream ag operation
(spray marking, yield attribution, agro-signal aggregation) joins on it.

## Triage

```bash
# 1. Confirm which ag operation + outcome is hot (dashboard, or PromQL):
#    job:ag_operation:failure_ratio5m  and  job:ag_operation_duration_ms:p95
#    Panels "Ag operation failure ratio per operation" + "Ag operation p95
#    duration per operation" on inflect-ag-operations.
```

```bash
# 2. Check the spatial-import job status endpoint (per-job state + last error).
APP_POD=$(kubectl --namespace inflect-production get pod \
  -l "app.kubernetes.io/component=app" \
  -o jsonpath='{.items[0].metadata.name}')

kubectl --namespace inflect-production exec "$APP_POD" -c inflect -- \
  curl -s http://127.0.0.1:3000/api/t/<slug>/ag/spatial-imports/<importId> | jq .
# Look at: status (failed|processing), error code (413/422), rejectedReason.
```

```bash
# 3. Worker logs — grep for the spatial-import job + the import id.
kubectl --namespace inflect-production logs \
  -l "app.kubernetes.io/component=worker" \
  --tail=500 \
  | grep -E "spatial-import|<importId>"
# Watch for: "413 payload too large", "422 invalid geometry",
#            "topology validation failed", "self-intersection".
```

```bash
# 4. Inspect the staged file record + size against the per-format cap.
#    (Read-only; use the inflect_readonly user.)
psql "$DIRECT_DATABASE_URL" -c "
  SELECT id, \"fileName\", \"mimeType\", \"sizeBytes\", \"createdAt\"
  FROM \"FileRecord\"
  WHERE domain = 'spatial'
  ORDER BY \"createdAt\" DESC
  LIMIT 20;"
# Compare sizeBytes to the per-format size caps (GeoJSON / shapefile / KML).
```

## Remediation

| Cause | Action |
|---|---|
| **413 — over the size cap** | Ask the customer to split the upload, OR simplify the geometry (decimate vertices) before re-staging. Do NOT raise the cap reflexively — it bounds worker memory. |
| **422 — invalid geometry** | The geometry is self-intersecting / has bad topology. Fix at source (re-export from GIS with "make valid" / `ST_MakeValid` semantics applied), then re-stage. The fail-closed reject is correct — never bypass validation to admit a broken parcel. |
| **Worker saturation / backlog** | Scale the worker: `helm upgrade --reuse-values --set worker.replicaCount=N inflect-production`. The import drains; `markOperationParcel` p95 recovers once parcel resolution stops queuing behind the import. |
| **Re-stage a fixed file** | Re-upload via the spatial-import flow; a fresh `FileRecord` (domain `spatial`) + new job is created. The old failed import row is left for audit. |

## Escalation

- Sustained `AgFieldOperationLatencyHigh` after scaling workers → page the
  ag-platform on-call; the slow path may be parcel resolution itself
  (spatial index / query), not the import.
- Repeated 422s for the **same** customer → loop in customer success; the
  customer's GIS export pipeline is producing invalid topology and needs a
  source-side fix.
- If geometry validation is suspected of false-rejecting valid input
  (a regression), file against the ag-platform team — do **not** disable
  validation as a workaround.

---

**Dashboard:** [inflect-compliance — Ag Field Operations](../grafana/ag-operations.json) (UID `inflect-ag-operations`)
