# 2026-06-30 — Spray-job assignee picker + journal-on-complete

**Commit:** `<sha> feat(spray): assignee picker as the final wizard step`

## Context

Two requests landed together:

1. A spray job should let the creator pick an **assignee** (a registered
   member) as the last section before creating it.
2. When a spray job is **marked complete by the assignee**, a row should
   appear automatically in the Farm Journal.

The investigation reframed both, because a "spray job" here is **not** a
`SprayJob` model — it is a `Task` of type `FIELD_OPERATION` with one
`OperationParcel` prescription line per parcel, and the journal is
`LogEntry`.

## Feature 1 — assignee picker (the only code change)

`Task.assigneeUserId` already existed end-to-end: the column, the
`CreateFieldOperationSchema` (which already **requires** an assignee), the
`createFieldOperation` usecase, and the `createTask` assignment
notification. The `SprayJobWizard` simply **hard-coded** the assignee to
the current user (`me.user.id`) and offered no UI.

Change: the confirm step now renders a `<UserCombobox>` ("Assign to") as
its last section, defaulted to the current operator (seeded on open once
`/api/auth/me` resolves, never clobbering a deliberate reassignment) and
reassignable to any active member. The body POSTed to
`/locations/:id/operations` is unchanged — still `{ …, assigneeUserId }`.
No schema / usecase / route / migration change was needed.

## Feature 2 — journal-on-complete (NO code change; already wired)

When the assignee marks an `OperationParcel` line `DONE`,
`markOperationParcel` → `recordInputApplication` already creates an
`INPUT_APPLICATION` `LogEntry` ("Applied <product> to <parcel>" + applied
quantity) and a `CONSUMPTION` stock transaction against the FEFO lot. It is
idempotent (one journal row per `operationParcelId`) and gated on the
`JOURNAL` module — which is **on by default** (`resolveEnabledModules(null)`
returns all modules; the agrent tenant has no `TenantModuleSettings` row).
The job auto-resolves to `RESOLVED` when the last line is done.

**Decision:** the user chose the existing **per-parcel** granularity (one
detailed journal row per parcel) over a job-level summary row. So feature 2
required no change — only end-to-end verification after deploy. A
job-level summary entry was explicitly **not** added (it would duplicate
the per-parcel rows for single-parcel jobs).

## Files

| File | Role |
| --- | --- |
| `src/app/t/[tenantSlug]/(app)/locations/[locationId]/SprayJobWizard.tsx` | Assignee `<UserCombobox>` added as the final confirm-step section; assignee state seeded from `/api/auth/me`. |

## Decisions

- **Confirm step, not a new step.** "Last section before creating" maps to
  the confirm step (which already gates finish on `Boolean(assigneeUserId)`
  and carries the "Create spray job" action), so the picker lives there
  rather than as a 5th step that would push confirm out of last place.
- **Seed-once, don't clobber.** The default-to-current-user effect only
  fills when the value is still null, so a manager reassigning the job
  isn't overwritten on re-render; `reset()` clears it on close so the next
  open re-seeds to whoever is signed in.
- **No job-level journal entry.** Per-parcel `INPUT_APPLICATION` rows are
  the canonical compliant spray record (they carry the inventory
  deduction); a parallel summary row was declined to avoid duplication.
