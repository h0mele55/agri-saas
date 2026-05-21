# 03 — Prometheus & Grafana

> How Prometheus and Grafana are deployed: scrape strategy, recording
> rules, alerts, retention, dashboards, and rollout. Companion
> artifacts: `infra/observability/prometheus/prometheus.yml`,
> `infra/observability/prometheus/rules/*.yml`,
> `infra/observability/grafana/provisioning/*`,
> `infra/observability/grafana/dashboards/*.json`.

# Prometheus Deployment Recommendation

**A single Prometheus instance, with a persistent volume, not HA.**
It is the `prometheus` service in
`infra/observability/docker-compose.observability.yml`, image
`prom/prometheus:v3.3.0`, running on the `observability` internal
network with no host port. Its TSDB lives on the named volume
`obs-prometheus-data`.

**Metrics are the in-scope storage boundary.** Prometheus's TSDB is
where time-series data lives. Traces are stored in Tempo (see
`01`/`04`); logs are out of scope (see `02`). Within this document,
"storage" means the Prometheus TSDB.

Single-instance is the **correct** posture, not a compromise:

- **The series count is modest.** The app's metrics are
  deliberately low-cardinality. Route labels are normalized by
  `normalizeRoute()` in `src/lib/observability/metrics.ts` — UUIDs
  collapse to `:id`, tenant slugs to `:tenantSlug` — so
  `api_request_*` has on the order of (routes × methods × status
  codes) series, not (requests) series. `tenant_id` is
  deliberately **not** a metric label (it is a span attribute
  instead) precisely so multi-tenancy does not explode cardinality.
  Repository metrics are labelled `{repo.method, outcome}` only;
  job metrics `{job.name, job.status}`; `audit_stream_delivery_failures`
  carries only `http.status_code`. The total active series count is
  in the low thousands.

- **HA / Thanos / Mimir is unwarranted complexity.** A second
  Prometheus replica plus a dedup layer, or a Thanos sidecar +
  store + query stack, solves problems this deployment does not
  have: cross-cluster aggregation, multi-year retention, and
  survive-a-replica-loss SLAs on the *monitoring* tier. The
  monitoring tier here observes one VM. A Prometheus restart is a
  sub-minute metrics gap on a persistent TSDB — not an outage.
  Paying the operational cost of HA to shrink a sub-minute gap is
  the wrong trade.

- **But the config is remote-write-ready.** `prometheus.yml` ships
  a **commented `remote_write:` block**. The day durability beyond
  one VM's disk is required — long-term storage, off-host
  retention, a managed backend — it is uncommenting a block and
  redeploying, not re-architecting. Single-node-now,
  remote-write-ready is the deliberate design:

  ```yaml
  # prometheus.yml — uncomment when long-term/off-host storage is needed.
  # remote_write:
  #   - url: https://<managed-prometheus-endpoint>/api/v1/write
  #     basic_auth:
  #       username: ${REMOTE_WRITE_USER}
  #       password: ${REMOTE_WRITE_PASSWORD}
  #     queue_config:
  #       max_samples_per_send: 1000
  #       capacity: 10000
  ```

Resource envelope: `mem_limit: 1g`, `cpus: 1.0` in the compose
file — comfortable headroom for this series count plus TSDB
compaction.

# Scrape Strategy

**Prometheus scrapes the four observability containers. It does not
scrape the application.** This is the push-vs-scrape boundary: the
app *pushes* OTLP to the collector; the collector *re-exposes*
application metrics on `:8889` for Prometheus to *scrape*. The app
itself has no `/metrics` endpoint and is not a scrape target.

```yaml
# infra/observability/prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    environment: ${DEPLOYMENT_ENVIRONMENT}   # production / staging / local

rule_files:
  - /etc/prometheus/rules/*.yml

scrape_configs:
  # Application metrics — via the collector's Prometheus exporter.
  - job_name: 'otel-collector-app-metrics'
    static_configs:
      - targets: ['otel-collector:8889']

  # The collector's own health (otelcol_* self-telemetry).
  - job_name: 'otel-collector-self'
    static_configs:
      - targets: ['otel-collector:8888']

  # Prometheus monitoring itself.
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Grafana's own metrics.
  - job_name: 'grafana'
    static_configs:
      - targets: ['grafana:3000']
    metrics_path: /metrics

  # Tempo's own metrics.
  - job_name: 'tempo'
    static_configs:
      - targets: ['tempo:3200']
    metrics_path: /metrics

# remote_write:   # commented — see "Retention / Storage Strategy"
```

Five scrape jobs, four targets that are observability components:

| Job | Target | Carries |
|-----|--------|---------|
| `otel-collector-app-metrics` | `otel-collector:8889` | All app metrics — `api_request_*`, `repo_method_*`, `job_*`, `audit_stream_delivery_failures` |
| `otel-collector-self` | `otel-collector:8888` | `otelcol_*` — the collector's ingest/export/drop health |
| `prometheus` | `localhost:9090` | `prometheus_*` — TSDB health, scrape health, rule eval |
| `grafana` | `grafana:3000/metrics` | `grafana_*` — Grafana's own health |
| `tempo` | `tempo:3200/metrics` | `tempo_*` — trace ingest/query health |

`scrape_interval: 15s` matches the resolution that the dashboards
and SLO alerts assume; `external_labels.environment` stamps every
series so that — should remote-write later ship to a shared
backend — series from different environments stay
distinguishable. **Static targets, not service discovery**: the
target set is four fixed docker service names. Service discovery
would add machinery to track a set that never moves.

The application does **not** appear in `scrape_configs`. If a
future change adds the app as a scrape target, that is an
architectural regression — the app is push-only by design.

# Recording Rules and Alerts

**Alerts are code.** Recording rules and alerting rules live in
`infra/observability/prometheus/rules/*.yml`, are mounted into
Prometheus (`./prometheus/rules:/etc/prometheus/rules:ro`), and
change only through git → review → redeploy.

**Division of labour: Prometheus holds the rules; Grafana evaluates
and routes.** Prometheus owns the recording rules (pre-computed
series) and the alerting rule *definitions*. Alert **evaluation**
and **notification routing** run through **Grafana Unified
Alerting** — there is **no standalone Alertmanager**. Rationale:
Alertmanager is a fifth component with its own config, its own
clustering story, and its own UI. Grafana already runs, already has
the Prometheus datasource, and already provisions contact points
and notification policies as code. Folding alert routing into
Grafana keeps the component count at four and gives operators a
single pane — rules, dashboards, and notifications in one place.
(Alertmanager remains the alternative if routing needs outgrow
Grafana's policy model — dead-letter routing, complex inhibition.
It does not today.)

## Recording rules

Pre-compute the expensive expressions the dashboards and alerts
reuse, so they are not recomputed on every panel render and every
rule evaluation.

```yaml
# infra/observability/prometheus/rules/recording-rules.yml
groups:
  - name: inflect_recording
    interval: 30s
    rules:
      # API request rate, per route+method.
      - record: job:api_request:rate5m
        expr: sum by (http_route, http_method) (rate(api_request_count_total[5m]))

      # API 5xx error ratio (the RED "errors" signal).
      - record: job:api_request_5xx:ratio5m
        expr: |
          sum(rate(api_request_count_total{http_status_code=~"5.."}[5m]))
          /
          sum(rate(api_request_count_total[5m]))

      # API p95 latency in milliseconds, fleet-wide.
      - record: job:api_request_duration:p95_5m
        expr: |
          histogram_quantile(0.95,
            sum by (le) (rate(api_request_duration_milliseconds_bucket[5m])))

      # Job failure ratio.
      - record: job:job_execution_failure:ratio5m
        expr: |
          sum(rate(job_execution_count_total{job_status="failure"}[5m]))
          /
          sum(rate(job_execution_count_total[5m]))
```

## Alerting rules

Three categories. Every rule has a `for:` window (no flapping), a
`severity` label that drives Grafana routing, and a `summary` /
`description` annotation that tells on-call what to do.

### Category 1 — Stack health (the observability stack itself)

```yaml
# infra/observability/prometheus/rules/alerting-rules.yml — group: stack_health
groups:
  - name: inflect_stack_health
    rules:
      # DEADMAN'S SWITCH — always firing by design. Wire Grafana to
      # alert if this STOPS arriving: a silent rule pipeline is the
      # failure this catches.
      - alert: ObservabilityDeadmanSwitch
        expr: vector(1)
        labels: { severity: none }
        annotations:
          summary: "Deadman's switch — should always be firing."
          description: "If this alert is NOT firing, Prometheus rule evaluation or notification delivery is broken."

      # A scrape target is down.
      - alert: ScrapeTargetDown
        expr: up == 0
        for: 2m
        labels: { severity: critical }
        annotations:
          summary: "Scrape target {{ $labels.job }} is down."
          description: "Prometheus cannot scrape {{ $labels.instance }} ({{ $labels.job }}) for 2m."

      # The collector specifically — app telemetry path is broken.
      - alert: CollectorDown
        expr: up{job="otel-collector-self"} == 0
        for: 2m
        labels: { severity: critical }
        annotations:
          summary: "OTel collector is down — app telemetry is being dropped."
          description: "The app's OTLP exports are failing. The APP ITSELF is unaffected (fire-and-forget telemetry), but metrics and traces have a gap until the collector recovers."

      # Collector cannot export to Prometheus surface or Tempo.
      - alert: CollectorExportFailing
        expr: |
          rate(otelcol_exporter_send_failed_metric_points[5m]) > 0
          or rate(otelcol_exporter_send_failed_spans[5m]) > 0
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "Collector is failing to export {{ $labels.exporter }}."
          description: "otelcol_exporter_send_failed_* is non-zero — the collector cannot reach a downstream."

      # Collector is shedding data (memory_limiter refusing).
      - alert: CollectorDroppingData
        expr: |
          rate(otelcol_processor_refused_metric_points[5m]) > 0
          or rate(otelcol_processor_refused_spans[5m]) > 0
          or rate(otelcol_processor_dropped_metric_points[5m]) > 0
          or rate(otelcol_processor_dropped_spans[5m]) > 0
        for: 5m
        labels: { severity: warning }
        annotations:
          summary: "Collector is dropping/refusing telemetry."
          description: "memory_limiter is shedding load, or a processor is dropping data. Check collector memory."
```

### Category 2 — Application health

```yaml
# infra/observability/prometheus/rules/alerting-rules.yml — group: app_health
groups:
  - name: inflect_app_health
    rules:
      # Elevated 5xx ratio.
      - alert: ApiHighErrorRate
        expr: job:api_request_5xx:ratio5m > 0.05
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "API 5xx ratio above 5% for 5m."
          description: "{{ $value | humanizePercentage }} of requests are 5xx."

      # Latency SLO breach — p95 over 1s.
      - alert: ApiLatencySLOBreach
        expr: job:api_request_duration:p95_5m > 1000
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "API p95 latency above 1000ms for 10m."
          description: "p95 request duration is {{ $value }}ms."

      # Job queue depth growing — worker not keeping up.
      - alert: JobQueueBacklog
        expr: max(job_queue_depth{queue_state="waiting"}) > 500
        for: 15m
        labels: { severity: warning }
        annotations:
          summary: "BullMQ waiting-queue depth above 500 for 15m."
          description: "The worker is not keeping up. waiting={{ $value }}."

      # Jobs failing.
      - alert: JobFailureRate
        expr: job:job_execution_failure:ratio5m > 0.10
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "Job failure ratio above 10% for 10m."
          description: "{{ $value | humanizePercentage }} of job executions are failing."

      # COMPLIANCE-CRITICAL — audit-stream delivery failing.
      - alert: AuditStreamDeliveryFailing
        expr: rate(audit_stream_delivery_failures_total[10m]) > 0
        for: 10m
        labels: { severity: critical }
        annotations:
          summary: "Audit-stream batches are failing delivery to a tenant SIEM."
          description: "audit_stream_delivery_failures is non-zero — a tenant's compliance audit trail is not reaching their SIEM. This is a compliance obligation. Investigate immediately."
```

`AuditStreamDeliveryFailing` is **critical** because the audit
stream is a compliance obligation, not a convenience. The app's
Epic C.4 / E.2 retry already exhausted up to 3 attempts before this
counter increments (`recordAuditStreamDeliveryFailure` is called
once per batch whose *final* attempt failed) — so a non-zero rate
means real, post-retry delivery loss to a tenant's SIEM.

### Category 3 — Resource exhaustion

```yaml
# infra/observability/prometheus/rules/alerting-rules.yml — group: resource
groups:
  - name: inflect_resource
    rules:
      # Prometheus TSDB disk runway — predict full within 4 days.
      - alert: PrometheusDiskFillingUp
        expr: |
          predict_linear(prometheus_tsdb_storage_blocks_bytes[6h], 4*24*3600)
            > 0.85 * (prometheus_tsdb_storage_blocks_bytes + 20e9)
        for: 1h
        labels: { severity: warning }
        annotations:
          summary: "Prometheus TSDB volume projected to fill within 4 days."
          description: "Free disk on obs-prometheus-data is shrinking. Reduce retention or grow the volume."

      # Prometheus rejected samples — cardinality or clock issue.
      - alert: PrometheusSampleIngestionStalled
        expr: rate(prometheus_tsdb_head_samples_appended_total[10m]) == 0
        for: 10m
        labels: { severity: critical }
        annotations:
          summary: "Prometheus has stopped appending samples."
          description: "The head block is not growing — ingestion has stalled or all targets are down."
```

# Retention / Storage Strategy

**Retention is per-environment, set by a flag.** The compose file
passes `--storage.tsdb.retention.time=${PROM_RETENTION}` to
Prometheus and `TEMPO_RETENTION` to Tempo's compactor.

| Environment | `PROM_RETENTION` (metrics) | `TEMPO_RETENTION` (traces) |
|-------------|---------------------------|----------------------------|
| Production | `30d` | `168h` (7d) |
| Staging | `15d` | `72h` (3d) |
| Local | `1d`–`3d` | `24h` |

**Storage sizing — the formula.** A Prometheus TSDB's on-disk size
is approximately:

```
bytes ≈ retention_seconds × ingestion_samples_per_second × bytes_per_sample
```

`bytes_per_sample` is ~1.5–2 bytes after TSDB compression.
`samples_per_second` = `active_series / scrape_interval`.

Worked estimate for this app's production stack — generous numbers:

- Active series: ~5,000 (low by design — normalized routes, no
  `tenant_id` label, bounded job/repo/audit label sets).
- `scrape_interval`: 15s → samples/sec ≈ 5,000 / 15 ≈ 333.
- `retention_seconds`: 30d ≈ 2,592,000.
- `bytes` ≈ 2,592,000 × 333 × 2 ≈ **1.7 GB**.

Even tripling the series estimate and doubling bytes-per-sample
lands well under 10 GB. **A 10–20 Gi volume is comfortable for
production at 30d retention**, with headroom for compaction's
transient 2× working set and series growth. The compose file's
`obs-prometheus-data` named volume should be provisioned at that
size; the `PrometheusDiskFillingUp` alert is the backstop if the
estimate is wrong.

Tempo at 7d / 20%-sampled traces is similarly modest — a 10 Gi
`obs-tempo-data` volume is ample; Tempo's compactor enforces
`block_retention` so old trace blocks are reclaimed automatically.

**Remote-write is the documented next step.** When 30d on one VM's
disk stops being enough — longer retention, off-host durability,
cross-environment aggregation — uncomment the `remote_write:` block
in `prometheus.yml` (skeleton above) and redeploy. The local TSDB
stays as the short-term/fast store; remote-write streams to the
long-term backend. No re-architecture, no data migration.

# Grafana Architecture

**A single Grafana instance, provisioned entirely from code,
exposed only through Caddy.** It is the `grafana` service, image
`grafana/grafana:11.6.0`, on the `observability` network, published
on **`127.0.0.1:3001` only** — never `0.0.0.0`. Public access is
exclusively via the existing Caddy reverse proxy with TLS (the
Caddy block is in `04-production-hardening.md`).

**Everything is provisioned-as-code** under
`infra/observability/grafana/provisioning/`:

- `datasources/` — the Prometheus datasource (metrics, set as
  default) and the Tempo datasource (traces). Provisioned, not
  click-configured, so a Grafana volume loss does not lose the
  datasource wiring.
- `dashboards/` — a dashboard provider pointing at
  `/var/lib/grafana/dashboards`, where the dashboard JSON files
  from `infra/observability/grafana/dashboards/` are mounted
  read-only.
- `alerting/` — contact points and notification policies (Grafana
  Unified Alerting). The contact point reads
  `GRAFANA_ALERT_WEBHOOK` from env so the destination differs per
  environment without a config edit.

**Authentication.** Configured via `GF_*` env vars in the compose
file — no `grafana.ini` carrying secrets.

- **Admin password** — `GF_SECURITY_ADMIN_PASSWORD` is mandatory
  (the compose file uses `:?` so a missing value aborts container
  start). This is the break-glass login.
- **Sign-up disabled, anonymous disabled** —
  `GF_USERS_ALLOW_SIGN_UP=false`,
  `GF_AUTH_ANONYMOUS_ENABLED=false` in staging and production.
  (Local may enable anonymous viewer for convenience.)
- **Recommended for real teams: Google OAuth SSO.** The product
  already uses Google OAuth (`src/auth.ts`). Reuse the same
  identity provider for Grafana: operators sign in with their
  Google account, no separate Grafana credential to manage or
  rotate. Configure via `GF_AUTH_GOOGLE_*` env vars.
- **Default role: Viewer.** `GF_USERS_AUTO_ASSIGN_ORG_ROLE=Viewer`
  so a newly-SSO'd user can read dashboards but cannot edit
  datasources, dashboards, or alert rules. Editor / Admin are
  granted deliberately. See the RBAC detail in
  `04-production-hardening.md`.

`GF_SERVER_ROOT_URL` is set to the public Caddy URL so share links,
alert callbacks, and the OAuth redirect resolve correctly.

# Dashboard Strategy

**Dashboards are code** — JSON files in
`infra/observability/grafana/dashboards/`, provisioned read-only. A
dashboard change is a git change, reviewed and redeployed. Operators
do not hand-edit provisioned dashboards in the UI (edits would be
overwritten on the next provision); ad-hoc exploration uses
new, user-owned dashboards.

**Operational alerts and dashboards are different surfaces, by
intent.** An alert *pages* — it is the "something is wrong, look
now" signal, and it is deliberately sparse (the categories in
"Recording Rules and Alerts"). A dashboard is for *investigation* —
"the alert fired, now show me the shape of the problem". You do not
put every panel behind an alert, and you do not rely on dashboards
to tell you something is wrong. Alerts find the problem;
dashboards explain it.

**Taxonomy — folders by concern:**

- **`Platform`** — the health of the observability stack itself and
  the infrastructure. Audience: whoever owns the monitoring stack.
- **`Application`** — the health of inflect-compliance: API RED
  metrics, repository performance, jobs and queues. Audience:
  whoever is on-call for the product.

(In staging, dashboards live under a `Staging` folder; production
under `Production` — per-environment Grafana folders, see `01`.)

**First dashboards to ship:**

1. **"Inflect — API Overview"** (`Application` folder) — the RED
   method: Rate, Errors, Duration.
   - Request rate by route+method: `job:api_request:rate5m`.
   - 5xx error ratio (single stat + timeseries):
     `job:api_request_5xx:ratio5m`.
   - Latency percentiles:
     `histogram_quantile(0.50, sum by (le) (rate(api_request_duration_milliseconds_bucket[5m])))`
     and the `0.95` / `0.99` variants.
   - Top routes by latency: `histogram_quantile(0.95, sum by (le, http_route) (rate(api_request_duration_milliseconds_bucket[5m])))`.
   - Error breakdown by `error_code` from `api_request_errors_total`.

2. **"Inflect — Jobs & Queues"** (`Application` folder) — the
   BullMQ worker.
   - Queue depth by state:
     `job_queue_depth` split on `queue_state`
     (`waiting` / `active` / `delayed` / `failed`).
   - Job throughput: `sum by (job_name) (rate(job_execution_count_total[5m]))`.
   - Job failure ratio: `job:job_execution_failure:ratio5m`.
   - Job duration p95: `histogram_quantile(0.95, sum by (le, job_name) (rate(job_execution_duration_milliseconds_bucket[5m])))`.
   - **Audit-stream delivery failures** —
     `rate(audit_stream_delivery_failures_total[10m])`, broken out
     by `http_status_code` (status `0` = network throw). A
     compliance-critical panel; it pairs with the
     `AuditStreamDeliveryFailing` alert.

3. **"Observability Stack Health"** (`Platform` folder) —
   monitoring-the-monitoring.
   - Scrape target up/down: `up` for every job.
   - Collector ingest vs export rates and
     `otelcol_exporter_send_failed_*` /
     `otelcol_processor_refused_*` / `otelcol_processor_dropped_*`.
   - Collector memory (against the `memory_limiter` ceiling).
   - Prometheus TSDB head series, ingestion rate, and disk-runway
     (`predict_linear` of `prometheus_tsdb_storage_blocks_bytes`).
   - Tempo ingest rate and query latency.
   - The deadman's switch status.

A useful fourth, once the first three are bedded in: **"Inflect —
Repository Performance"** (`Application`) — `repo_method_duration`
p95 by `repo.method`, call rate, error rate, and result-count
distribution from `repo_method_result_count` — the surface for
spotting a slow or chatty repository query before it shows up as
API latency.

# Operational Rollout Plan

Aligned with the phased rollout in `01-deployment-topology.md`;
this is the Prometheus/Grafana-specific sequence.

1. **Land the config in git.** `prometheus.yml`, all `rules/*.yml`,
   the Grafana `provisioning/` tree, and the dashboard JSON. CI
   validates: `promtool check config prometheus.yml` and
   `promtool check rules rules/*.yml`.

2. **Deploy on staging, stack-only.** Bring up the compose stack.
   Confirm the Prometheus targets page shows all five jobs `UP`
   (collector `:8889`, collector `:8888`, prometheus, grafana,
   tempo). Confirm recording rules evaluate (`job:*` series exist).

3. **Confirm Grafana provisioning.** Datasources present and
   healthy; dashboards rendered in the right folders; alert rules
   loaded in Grafana Unified Alerting; the contact point points at
   the staging low-severity channel.

4. **Turn on app telemetry (staging).** `OTEL_ENABLED=true` on the
   staging app. Confirm `api_request_count_total` is non-zero and
   "Inflect — API Overview" shows live data.

5. **Fire-drill the alerts (staging).** Stop the collector —
   `CollectorDown` and `ScrapeTargetDown` should fire after their
   `for:` window and notify the staging channel. Confirm the
   deadman's switch behaviour. Restart; confirm recovery clears
   the alert.

6. **Tune thresholds against real staging data.** The 5%/1000ms/
   500-depth/10% thresholds above are starting points. Watch a
   week of staging traffic; adjust so alerts fire on genuine
   regressions, not normal variance. Commit the tuned thresholds.

7. **Production rollout.** Deploy the stack with the production
   `.env` (`PROM_RETENTION=30d`, `TEMPO_RETENTION=168h`, durable
   volumes, SSO). Place Grafana behind Caddy with TLS. Point the
   contact point at the on-call channel and configure sev-1
   paging. Turn on `OTEL_ENABLED` for the production app.

8. **Verify in production.** Acceptance checklist below; a sev-1
   test alert pages on-call.

# Acceptance Criteria

- [ ] `infra/observability/prometheus/prometheus.yml` exists with
      exactly five scrape jobs: collector `:8889`, collector
      `:8888`, prometheus, grafana, tempo. The **application is not
      a scrape target**.
- [ ] `prometheus.yml` ships a **commented** `remote_write:` block.
- [ ] Recording rules (`job:api_request:rate5m`,
      `job:api_request_5xx:ratio5m`, `job:api_request_duration:p95_5m`,
      `job:job_execution_failure:ratio5m`) and alerting rules live
      in `infra/observability/prometheus/rules/*.yml`, mounted
      read-only, and pass `promtool check rules`.
- [ ] Alert coverage spans all three categories: stack health
      (collector down, target down, export failures, dropped data,
      a deadman's switch), app health (5xx ratio, latency SLO,
      queue backlog, job failures, **audit-stream delivery
      failures**), and resource (TSDB disk runway, ingestion
      stall).
- [ ] `AuditStreamDeliveryFailing` is `severity: critical` and
      fires on `rate(audit_stream_delivery_failures_total[10m]) > 0`.
- [ ] Alert evaluation and routing run through **Grafana Unified
      Alerting** — no standalone Alertmanager container.
- [ ] Retention is per-environment: production 30d metrics / 7d
      traces, staging 15d / 3d, local ≤3d / 1d — set via
      `PROM_RETENTION` and `TEMPO_RETENTION`.
- [ ] The Prometheus volume `obs-prometheus-data` is durable in
      staging/production and sized 10–20 Gi; the
      `PrometheusDiskFillingUp` alert is active.
- [ ] Grafana publishes `127.0.0.1:3001` only and is reachable
      publicly only via Caddy with TLS.
- [ ] Grafana datasources (Prometheus default, Tempo),
      dashboards, and alerting are **all provisioned from code**
      under `infra/observability/grafana/provisioning/`.
- [ ] Grafana has sign-up disabled, anonymous disabled
      (staging/prod), admin password mandatory, default role
      Viewer; Google OAuth SSO configured for production.
- [ ] Dashboards exist in `Platform` and `Application` folders;
      "Inflect — API Overview", "Inflect — Jobs & Queues", and
      "Observability Stack Health" render real data.
- [ ] A deliberate collector stop fires `CollectorDown` and
      notifies the configured channel within the alert's `for:`
      window.
