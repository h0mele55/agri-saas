# 2026-05-21 — Observability & reliability capstone

**Commit:** `<pending> test(guards): observability-reliability meta-ratchet + audit-stream guard`

## Design

The final item of the three-prompt observability/reliability
roadmap. The first two remediations:

- **P1 — audit-stream observability:** delivery failures became real
  OTel metrics (`recordAuditStreamDelivery` + five more instruments)
  instead of an in-memory `_deliveryFailureCount`.
- **P2 — Redis eviction policy:** BullMQ-bearing Redis switched from
  `allkeys-lru` to `noeviction`, with a runtime check and a
  structural guard (`redis-eviction-policy.test.ts`).

P2 shipped its own structural guardrail; P1 shipped unit tests but
no structural ratchet. So the capstone does two things:

### 1. The audit-stream observability guardrail

`tests/guards/audit-stream-observability.test.ts` — the structural
ratchet P1 lacked. It scans `audit-stream.ts` + `metrics.ts` and
fails CI if:

- `recordAuditStreamDelivery` (or the buffer-overflow / depth
  recorders) stops being called — delivery going un-instrumented;
- the call drops its `outcome:` field — success/failure ratio lost;
- the in-memory `_deliveryFailureCount` regression returns;
- any of the six `audit_stream.*` instruments is removed from
  `metrics.ts`.

### 2. The meta-ratchet

`tests/guards/observability-reliability-integrity.test.ts` carries a
registry of the two reliability guardrails and fails CI if either is
deleted or gutted to a no-op (file exists, keeps its subject
anchors, carries >= 3 `it`-blocks). It also locks the runtime wiring
both remediations depend on. It is the reliability-domain sibling of
`ci-pipeline-integrity.test.ts` — same "guard the guards" pattern, a
separate domain, a separate file (keeping each capstone's scope
honest to its name).

`docs/observability-reliability.md` is the unified map: pillar →
risk → remediation → guardrail.

## Files

| File | Role |
|------|------|
| `tests/guards/audit-stream-observability.test.ts` | NEW — structural ratchet that audit-stream stays OTel-instrumented. |
| `tests/guards/observability-reliability-integrity.test.ts` | NEW — the meta-ratchet: guards both reliability guardrails + the runtime wiring. |
| `docs/observability-reliability.md` | NEW — unified pillar → risk → remediation → guardrail map. |

## Decisions

- **A separate meta-ratchet, not an extension of
  `ci-pipeline-integrity.test.ts`.** That file is scoped to the
  CI/CD pipeline; audit-stream + Redis are backend-reliability
  concerns. Two roadmaps, two domain capstones — each meta-ratchet's
  name stays honest. The "guard the guards" pattern is shared; the
  registries are not.

- **The audit-stream guardrail was genuinely missing.** P2 already
  shipped `redis-eviction-policy.test.ts`, but P1's verification was
  unit tests only. The capstone supplies the structural ratchet so
  the OTel wiring cannot silently regress — which is precisely the
  "cannot degrade back to in-memory-only tracking" the prompt asked
  for.

- **"Not gutted" = anchors + `it`-count**, identical to the CI/CD
  meta-ratchet — a guardrail emptied to `it('ok', () => {})` would
  still "exist"; requiring its subject anchors + >= 3 `it`-blocks
  catches the gut-to-no-op move.

- **No new Redis enforcement.** P2's runtime check + structural
  guard already satisfy "prevent unsafe Redis eviction policy". The
  capstone only META-guards that guardrail; re-implementing the
  enforcement would be duplication.
