# Runbook — Ag Weather Ingestion Lag

> Fires from `AgWeatherIngestionLag`
> (`infra/observability/prometheus/rules/alerting-rules.yml`, group
> `inflect_ag_operations_slo`).
>
> First-look dashboard: **inflect-compliance — Ag Field Operations**
> (`docs/grafana/ag-operations.json`, UID `inflect-ag-operations`) —
> panels "Weather-pull job duration p95" + "Weather-pull failure ratio".

---

## Trigger

- `AgWeatherIngestionLag` —
  `increase(job_execution_count_total{job_name="weather-pull",job_status="failure"}[6h]) > 0`
  for 30m.
- Operator report: agro-signals (GDD, spray windows, ET) look stale; no
  weather observations for today.

## What it means

The `weather-pull` BullMQ job — which fetches daily observations from
Open-Meteo and writes `WeatherObservation` rows — is failing or stalled.
Common causes:

- **Open-Meteo outage / rate-limit / schema change** — the upstream API
  is unreachable, throttling, or returning an unexpected shape.
- **Scheduler not firing** — the job stopped being enqueued (scheduler
  down, cron drift, queue paused).
- **Worker not draining** — the job is enqueued but the worker is down or
  backed up.

**Why it matters:** agro-signals depend on fresh weather. Growing-degree-day
accumulation, spray-window suitability, and evapotranspiration are all
derived from `WeatherObservation`. Stale weather silently degrades every
downstream agronomic recommendation — the data isn't wrong, it's *old*,
which is harder to notice.

## Triage

```bash
# 1. Is the weather-pull job actually running, and what was its last error?
#    Dashboard panels show p95 + failure ratio; for the last error, logs:
kubectl --namespace inflect-production logs \
  -l "app.kubernetes.io/component=worker" \
  --tail=500 \
  | grep -E "weather-pull|open-meteo|WeatherObservation"
# Watch for: HTTP 429/5xx from Open-Meteo, timeouts, JSON parse errors.
```

```bash
# 2. How stale is the data? Latest observation date per the table.
psql "$DIRECT_DATABASE_URL" -c "
  SELECT max(\"obsDate\") AS latest_obs,
         now()::date - max(\"obsDate\") AS days_behind,
         count(*) AS rows_today
  FROM \"WeatherObservation\"
  WHERE \"obsDate\" = now()::date;"
# rows_today = 0 and days_behind >= 1 confirms the lag.
```

```bash
# 3. Is Open-Meteo reachable from inside the cluster?
kubectl --namespace inflect-production run --rm -it --image=curlimages/curl debug -- \
  curl -s -o /dev/null -w "%{http_code} %{time_total}s\n" \
  "https://api.open-meteo.com/v1/forecast?latitude=52&longitude=13&daily=temperature_2m_max"
# 200 + a small time = upstream healthy → the fault is ours (scheduler/worker).
# 429 / 5xx / timeout = upstream outage or rate-limit.
```

```bash
# 4. Is the job being enqueued at all? Check queue depth / recent runs.
#    (job_queue_depth gauge, queue_name="weather", on the dashboard; or:)
kubectl --namespace inflect-production logs \
  -l "app.kubernetes.io/component=worker" \
  --since=24h | grep -cE "weather-pull (started|completed)"
# 0 over 24h = the job isn't being scheduled (scheduler/cron problem),
# not a per-run failure.
```

## Remediation

| Cause | Action |
|---|---|
| **Transient Open-Meteo failure** (429 / brief 5xx) | Re-run the job manually; it backfills today's window. Trigger via the admin job-run endpoint or enqueue `weather-pull` from a worker shell. |
| **Open-Meteo outage (sustained)** | Nothing to do upstream-side but wait. Note the gap; once Open-Meteo recovers, re-run to backfill the missed `obsDate`(s). Communicate to ag users that agro-signals are based on stale weather until backfilled. |
| **Open-Meteo schema / param change** | If the API shape changed (parse errors despite 200s), this is a code fix — file against the ag-platform team. Do not paper over with a retry. |
| **Scheduler not firing** | Check the scheduler/cron that enqueues `weather-pull`. Restart the scheduler; confirm the job lands in the queue. |
| **Worker down / backlog** | Scale / restart the worker: `helm upgrade --reuse-values --set worker.replicaCount=N inflect-production`. The job drains; verify with step 2 that `rows_today > 0`. |

Re-run command (from a worker pod, illustrative):

```bash
WORKER_POD=$(kubectl --namespace inflect-production get pod \
  -l "app.kubernetes.io/component=worker" \
  -o jsonpath='{.items[0].metadata.name}')
kubectl --namespace inflect-production exec "$WORKER_POD" -c worker -- \
  node scripts/enqueue-job.mjs weather-pull
# Then re-check: SELECT max("obsDate") FROM "WeatherObservation";
```

## Escalation

- If Open-Meteo is down for >6h, escalate to the ag-platform team to
  decide on a fallback provider or a wider customer comms note about
  stale agro-signals.
- If the job is enqueuing but every run fails with the same upstream
  error after Open-Meteo is confirmed healthy, it's a code/auth issue
  (bad API key, changed endpoint) — page the ag-platform on-call.

---

**Dashboard:** [inflect-compliance — Ag Field Operations](../grafana/ag-operations.json) (UID `inflect-ag-operations`)
