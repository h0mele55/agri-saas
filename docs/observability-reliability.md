# Observability & backend reliability

Two remediations hardened the backend's runtime-reliability surface.
Each closed a concrete weakness AND shipped a structural guardrail
that fails CI if the weakness returns. This doc is the map.

| Pillar | Risk it closes | Guardrail |
|--------|----------------|-----------|
| 1. Audit-stream observability | Delivery failures invisible beyond logs + an in-memory counter | `audit-stream-observability.test.ts` |
| 2. Redis eviction policy | BullMQ job state silently evicted under memory pressure | `redis-eviction-policy.test.ts` |

A **meta-ratchet** (`observability-reliability-integrity.test.ts`)
guards both — see the last section. This is the reliability-domain
sibling of `docs/ci-cd-pipeline-integrity.md`.

---

## 1. Audit-stream delivery observability

**Risk.** `audit-stream.ts` forwards committed audit rows to a
tenant SIEM. Its only durable failure signal was one OTel counter
plus `logger.warn`; an in-memory `_deliveryFailureCount` was a test
shim. Operators had no view of the success ratio, retry pressure,
latency, or buffer backlog.

**Remediation.** `deliverBatch` records every batch outcome once,
after the retry loop, via `recordAuditStreamDelivery`. Six OTel
instruments (`src/lib/observability/metrics.ts`):

- `audit_stream.delivery.success` / `.failures` — counters → the
  delivery **success ratio**;
- `audit_stream.delivery.attempts` — histogram → **retry pressure**;
- `audit_stream.delivery.duration` — histogram → delivery latency;
- `audit_stream.buffer.overflow_dropped` — counter → events shed
  under backpressure;
- `audit_stream.buffer.depth` — observable gauge → backlog.

**Failure semantics.** Audit-stream failures deliberately do NOT
gate `/api/readyz` — the path is out-of-band + fail-safe (the audit
row is committed before streaming is attempted, so a broken SIEM
never costs data and must never take the app out of rotation).
Escalation is **alert-based on the metrics**: alert when the success
ratio drops below SLO, when `buffer.overflow_dropped` rate > 0, or
when `buffer.depth` stays high.

**Guardrail.** `audit-stream-observability.test.ts` — fails CI if
the OTel calls are dropped, if the metrics are removed, or if the
in-memory `_deliveryFailureCount` regression returns. **Details:**
`docs/implementation-notes/2026-05-21-audit-stream-observability.md`.

## 2. Redis eviction policy (BullMQ durability)

**Risk.** BullMQ stores job state in Redis. Every Docker Compose
`redis` service ran `--maxmemory-policy allkeys-lru` — a key-evicting
policy. Under memory pressure, queued jobs were silently dropped.
(ElastiCache was already correct — terraform pins `noeviction`.)

**Remediation.** All four Compose `redis` services →
`--maxmemory-policy noeviction`. With `noeviction` + a `maxmemory`
cap, a full Redis *rejects* writes (`OOM`, visible) instead of
discarding job records. `verifyRedisEvictionPolicy`
(`src/lib/redis.ts`), called best-effort at startup from
`src/instrumentation.ts`, logs loudly if the connected Redis is
evicting — it does **not** `process.exit` (a wrong policy is
degraded-not-broken; a boot crash-loop on a drifted deployment is
worse).

**Guardrail.** `redis-eviction-policy.test.ts` — fails CI if any
Compose `redis` reverts to a key-evicting policy, and asserts the
runtime check stays wired. **Details:** the "Redis — eviction
policy" section of `docs/deployment.md` +
`docs/implementation-notes/2026-05-21-redis-eviction-policy.md`.

---

## The meta-ratchet — guarding the guards

`tests/guards/observability-reliability-integrity.test.ts` carries a
registry of the two reliability guardrails and fails CI if either is
**deleted** or **gutted to a no-op** (the file must exist, still
contain its subject anchors, and carry a real assertion surface). It
also locks the runtime wiring both remediations depend on
(`recordAuditStreamDelivery`, `verifyRedisEvictionPolicy`).

Removing a reliability guardrail now means a red meta-ratchet, not a
silently weakened backend. Retiring a remediation stays possible —
delete the guardrail AND its registry entry in the same diff — but
that is now an explicit, reviewed act.

When you add a new reliability guardrail, add it to the `GUARDRAILS`
registry in the meta-ratchet (and bump the count assertion).
