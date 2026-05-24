# 2026-05-24 — Audit S10: Tenant Isolation & Authorization Model

**Commit:** `(this PR — feat/audit-s10-tenant-isolation)`

The Audit Coherence audit (composite 9.0/10) flagged three open
questions for the tenant-isolation / authorization layer. The
audit deliberately left two of the three as "decide" / "likely
defer" rather than prescribe — this note records the decisions
made in this PR and the rationale.

## Design

The product already has two tenant-isolation enforcement layers:

1. **PostgreSQL RLS** (Epic A.1). Every tenant-scoped table has
   `tenant_isolation` + `superuser_bypass` policies and
   `FORCE ROW LEVEL SECURITY`. Tenant context is bound per-
   transaction; an `app_user` session that didn't bind context
   sees zero rows.

2. **Role-based RBAC** (Epic G + Epic 1). Five built-in roles
   (`OWNER` / `ADMIN` / `EDITOR` / `READER` / `AUDITOR`) plus
   custom roles with per-permission overrides
   (`TenantCustomRole.permissionsJson`). `PermissionSet`
   resolution is compile-time typed.

The audit identified three remaining gaps:

  - **Gap 1**: Restore operations have no entity-specific
    validation. `restoreEntity` clears `deletedAt` for any
    soft-deleted row the calling admin can see — no parent-existence
    check, no immutability check.

  - **Gap 2**: No field-level RBAC. A READER who can see a
    Risk can see ALL of its fields, including the sensitive
    `score` + `inherentImpact`. The audit asked us to DECIDE
    whether to implement this.

  - **Gap 3**: No attribute-based access control (ABAC). The
    audit asked us to defer this; the explicit defer with a
    rationale lives in this note.

### Decision — Gap 1: ship entity-specific restore validators (this PR)

A per-model validator table sits in
`src/app-layer/domain/restore-validators.ts`. `restoreEntity`
consults it before clearing `deletedAt`. Three concrete validators
in this PR; nine other models stay on `NOOP_VALIDATOR`.

  - **`Task`** — refuse if the parent `controlId` points at a
    deleted Control row. Orphaned tasks are invisible (the control
    page hides them) but still count toward audit-readiness; the
    blocker is explicit at restore time.

  - **`AuditPack`** — refuse if the parent `AuditCycle` is
    soft-deleted OR `COMPLETE`. The cycle-immutable contract
    relies on packs under a closed-out cycle staying frozen;
    restoring a pack into a completed cycle would silently
    violate it. `COMPLETE` is the terminal value on the
    `AuditCycleStatus` enum — the audit-cycle equivalent of
    CLOSED on other lifecycles.

  - **`Evidence`** — refuse if `ownerUserId` is set but the user
    is no longer an `ACTIVE` member of the tenant. The owner is
    the actor of record for the re-submission cycle; restoring
    orphan-owned evidence leaves the row in "pending review by
    nobody" limbo.

New validators are intentional narrowing: open one with a written
precondition AND a unit test row. The `RESTORE_VALIDATORS` table
is keyed on the `RestorableModel` union so lookup is total — no
fallback path that could silently drop a check.

### Decision — Gap 2: field-level RBAC stays deferred

Field-level RBAC would let a tenant policy say "READER sees
Risk.title but not Risk.score". Implementing it well requires:

  - A schema-level allowlist per field per role (not just per
    model) — large and easy to drift from the real shape.

  - Repository-layer projection logic that rewrites every
    `select:` to drop forbidden fields BEFORE returning rows.
    Currently `select:` shapes are spelled inline in every
    findMany; centralising them would be a multi-week refactor.

  - PDF/CSV exporter integration — exports re-flatten the row
    shape and would need parallel field gates.

  - A frontend strategy — most "READER-blind" fields are
    currently hidden by `<Conditional canRead={...}>` blocks
    that key off the permission set. The role-tier model already
    expresses 90% of the cases the audit examples used.

The product hasn't seen a concrete customer ask that role-tier
permissions don't already cover. We're punting field-level RBAC
to a follow-up roadmap that can take it end-to-end (schema →
repos → exports → UI). Not in this PR.

### Decision — Gap 3: ABAC deferred (matches audit guidance)

Attribute-based access control would let a tenant policy say
"user X can only write Risk rows where `Risk.businessUnit ===
X.businessUnit`". The audit explicitly suggested deferring this;
we agree:

  - The tenant model is already the strongest isolation primitive
    in the product (RLS-enforced at the DB).

  - Within a tenant, the role-tier model + custom-role overrides
    cover every concrete enterprise-tier ask in the past 12
    months.

  - Real ABAC needs a policy engine (OPA / Cedar) and a per-
    request attribute extraction layer; this is a several-week
    investment with no current customer pull.

The decision logged here is the deferred outcome of the audit's
"likely defer" recommendation — not a new analysis. Revisit when
a Fortune 500 SOC2 tenant asks specifically.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/domain/restore-validators.ts` | Per-model validator registry + 3 concrete validators |
| `src/app-layer/usecases/soft-delete-operations.ts` | Calls `getRestoreValidator(...)` BEFORE clearing deletedAt |
| `tests/guardrails/audit-s10-tenant-isolation.test.ts` | Structural ratchet locking the registry + wiring |
| `tests/unit/usecases/restore-validators.test.ts` | Unit tests covering each validator's accept/reject paths |
| `docs/implementation-notes/2026-05-24-audit-s10-tenant-isolation.md` | This note — the two deferral decisions |

## Decisions

  - **Validator registry is total** — `RESTORE_VALIDATORS: Record<RestorableModel, RestoreValidator>` rather than `Partial<Record<...>>`. A new soft-deletable model must explicitly declare its validator (`NOOP_VALIDATOR` is fine, but the choice has to be made).

  - **Validators throw `badRequest`, not `forbidden`** — the call IS authorised (admin-only) but the PRECONDITIONS aren't met. `badRequest` surfaces a clear "fix the precondition then retry" message; `forbidden` would imply the role is wrong.

  - **Restore audit row stays unchanged** — every restore still emits the same `ENTITY_RESTORED` audit row with the prior `deletedAt` in `before:`. Failed restores produce no audit row (the gate runs before any state change).
