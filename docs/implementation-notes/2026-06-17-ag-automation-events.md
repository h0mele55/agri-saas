# 2026-06-17 — Ag field workflows → automation triggers

**Follows:** the observability epic (which surfaced the ag audit events)
and builds on the Epic-60 automation backbone.

## Design

Three field-workflow events become subscribable automation triggers, so
a tenant can build rules like "notify the agronomist when a spray job is
created", "open a QA task when a parcel is marked done", or "alert the
buyer when a harvest yield is recorded":

| Event | Emitted from | Payload (`data`) |
|-------|--------------|------------------|
| `SPRAY_JOB_STARTED` | `field-operation.createFieldOperation` | taskId, taskKey, locationId, operationType, parcelCount, productItemId, assigneeUserId |
| `OPERATION_PARCEL_MARKED` | `field-operation.markOperationParcel` | taskId, operationParcelId, parcelId, status, jobResolved |
| `HARVEST_YIELD_RECORDED` | `yield-record.createYieldRecord` | yieldRecordId, commodity, grossTonnes, areaHa, plantingId, seasonId |

Each event name mirrors the audit `action` string one-to-one (the
automation layer plugs into the same event vocabulary, no translation
table). The wiring follows the four-step Epic-60 contract exactly:

1. **Catalog** — added to `AUTOMATION_EVENTS` (`events.ts`).
2. **Typed contract** — a `*Data` interface + discriminated-union member
   in `event-contracts.ts`. The compile-time `_CatalogueConsistency`
   check forces every catalog name to have a union variant.
3. **Emit** — `emitAutomationEvent(ctx, …)` alongside the existing
   `logEvent`, AFTER the tenant tx (createFieldOperation / yield-record)
   or at the tail of the tx once `resolved` is known (markOperationParcel).
4. **Builder labels** — an `EVENT_LABELS` entry under a new
   `'Field operations'` domain, with `filterFields` so the condition
   builder can facet on operationType / status / commodity / etc.
   (`EVENT_LABELS` is an exhaustive `Record<AutomationEventName,…>`, so
   tsc *requires* this leg.)

## Files

| File | Change |
|------|--------|
| `automation/events.ts` | +3 catalog entries |
| `automation/event-contracts.ts` | +3 `*Data` interfaces + union members |
| `automation/index.ts` | barrel re-exports the 3 data types |
| `lib/automation/event-labels.ts` | +`'Field operations'` domain + 3 label entries |
| `usecases/field-operation.ts` | emit SPRAY_JOB_STARTED + OPERATION_PARCEL_MARKED |
| `usecases/yield-record.ts` | emit HARVEST_YIELD_RECORDED |
| `tests/unit/automation.ag-wiring.test.ts` | runtime bus-emission proof (all 3) |
| `tests/guards/automation-ag-emits.test.ts` | structural lock (catalog + labels + emit sites) |
| `tests/unit/automation.event-contracts.test.ts` | +3 `buildFakeEvent` cases |

## Decisions

- **No action-handler or builder-UI changes.** Action handlers
  (create-task / notify / webhook / update-status) are event-agnostic;
  the builder reads `eventOptionsByDomain()` / `EVENT_LABELS` dynamically,
  so the new domain + triggers appear with zero UI edits.
- **`stableKey` choices.** SPRAY/HARVEST key on the entity id (one job /
  one yield row = one fire). OPERATION_PARCEL_MARKED keys on
  `${lineId}:${status}` — re-marking a parcel to a different status is a
  distinct, idempotency-relevant event.
- **Emit placement = after the writes.** Mirrors `task.ts`: a rule must
  never act on a rolled-back change, so the emit is the last step (post-
  commit for the two-phase usecases; tail-of-tx for markOperationParcel
  where `jobResolved` is only known at the end).
- **Two test layers.** Runtime wiring (proves the bus actually receives
  the event + payload) + a structural guard (locks catalog/label/emit-site
  so a future refactor can't silently drop a leg) — the same belt-and-
  braces shape as the cycle-2 `automation-domain-emits` guard.
