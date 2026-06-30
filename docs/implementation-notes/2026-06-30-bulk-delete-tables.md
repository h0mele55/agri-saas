# 2026-06-30 — Bulk-delete across the entity tables

**Commit:** `<sha> feat(tables): bulk-delete action row + rollout`

Adopts the inflect-compliance "bulk delete via the table selection action-row"
feature onto agri-saas.

## Design

agri-saas already inherited the DataTable selection machinery from the
inflect-compliance platform — `BatchAction<T>`, `renderBatchActions`,
`SelectionToolbar`, and `DataTable.batchActions` / `selectionControls` were
all present and identical. The only missing primitive was the confirm step.

So the feature is one shared hook plus a per-entity backend + 3-line client
wiring:

- **`useBulkDelete<T>`** (`src/components/ui/table/use-bulk-delete.tsx`) —
  returns a danger `BatchAction` (Trash icon, "Delete"/"Revoke"/"Remove"
  verb) for the selection action-row, **and** a canonical danger
  `ConfirmDialog` ("Delete N …?"). The `verb` prop is union-typed to the
  canonical destructive verbs so a bulk action can never ship an ambiguous
  label. `triggerByIds(ids)` is the escape hatch for tables that drive
  selection through a custom `selectionControls` bar (Tasks) instead of
  `batchActions`.
- **Per entity:** a `bulkDelete<Entity>` usecase (mirrors the entity's
  existing single-delete: same permission gate, same soft-delete mechanism,
  one audit row per row, idempotent), a `POST .../bulk/delete` route, and the
  client wiring (`useBulkDelete` + `batchActions` gated on the entity's
  permission tier + render the dialog).

## Two route shapes

- **Entity tables** (risks, assets, controls, evidence, policies, vendors,
  findings, tasks, locations): route uses `getTenantCtx` + the usecase's own
  `assertCan*`. Not a privileged root, so no `requirePermission`.
- **Admin-root tables** (invites, members, roles, api-keys): under
  `/admin/`, so the route uses `requirePermission(<key>)` AND must be listed
  in `ADMIN_ONLY_ROUTES` (admin-route-coverage guard).

## Three soft-delete mechanisms

1. **Middleware** — entities in `SOFT_DELETE_MODELS` (Risk, Asset, Control,
   Evidence, Policy, Vendor, Finding, Task): `deleteMany` is auto-rewritten
   to set `deletedAt`; `findMany` auto-filters already-deleted rows.
2. **Explicit** — Location (not in the set): `LocationRepository.softDelete`
   in a writes-only loop.
3. **Status column** — invites (`revokedAt`), members
   (`status: DEACTIVATED`), roles (`isActive: false`), api-keys
   (`revokedAt`): tenant-scoped `updateMany`.

## Files

| Area | Role |
| --- | --- |
| `src/components/ui/table/use-bulk-delete.tsx` | The shared hook (only new primitive). |
| `src/app-layer/usecases/{risk,asset,evidence,policy,vendor,finding,location,task,control/mutations,tenant-admin,tenant-invites,custom-roles,api-keys}.ts` | `bulkDelete*` / `bulkRevoke*` / `bulkDeactivate*` usecases. |
| `src/app/api/t/[tenantSlug]/**/bulk/delete/route.ts` | 13 bulk routes. |
| entity client components | `useBulkDelete` wiring. |

## Decisions

- **Members — batch-aware last-OWNER/ADMIN protection.** A naive per-row
  guard would let a multi-select deactivate every owner. `bulkDeactivateTenantMember`
  fetches the tenant's active owner/admin totals once, then greedily picks
  deactivations while keeping ≥1 of each — N+1-safe (one `findMany` + two
  counts + one `updateMany`). The DB trigger remains the backstop. Skips the
  caller's own row.
- **Controls — split permission.** The existing `controlBatchActions`
  status verbs are edit-gated; delete is admin-gated (matching single
  `deleteControl`). Selection is enabled whenever any batch action is present.
  The `tenantId` filter also excludes global library controls.
- **Verb register.** Delete (default) / Revoke (invites, api-keys — credentials)
  / Remove (members — detach). All canonical per the destructive-vocabulary
  ratchet; the hook's `verb` type enforces it.
- **Excluded with cause.** Inventory (its table lists stock *lots*, which have
  no `deletedAt` and no single-delete to mirror — bulk-deleting them would be
  inventing destructive semantics) and Frameworks (a fixed install/uninstall
  catalog, not user-deletable rows). Either would need prerequisite work
  (a single-delete + soft-delete model membership + a selectable table) before
  the bulk template applies.
- **Guard exemption.** `destructive-vocabulary` got a documented dynamic-label
  exemption for the hook — its `confirmLabel={verb}` is dynamic but the `verb`
  is union-typed to canonical verbs, so it's safe by construction.
