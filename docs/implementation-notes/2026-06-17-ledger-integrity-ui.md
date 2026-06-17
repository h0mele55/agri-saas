# 2026-06-17 — Stock Ledger Integrity admin page

**Follows:** the `feat/observability` epic, which landed
`reconcileStockLedger` + `POST /api/t/:slug/admin/ledger-reconciliation`
but no UI. This closes that loop.

## Design

A new admin page at `/t/:slug/admin/ledger-integrity`:

- **Server page** (`page.tsx`) — fetches the run history via
  `listLedgerReconciliationHistory(ctx)`, graceful-degrades to `[]` on a
  permission error (a member without read access sees an empty timeline,
  not a 500), and hands a serialized snapshot to the client island.
- **Client island** (`LedgerIntegrityClient.tsx`) — a status hero
  (intact / drift / never-run, derived from `history[0]`), a **Run
  reconciliation** primary button that POSTs the existing admin route
  and `router.refresh()`es on success, and a history `DataTable`.

**History has no dedicated table.** Each reconciliation run already
writes a `LEDGER_RECONCILIATION_RUN` audit row carrying
`detailsJson.data = { valid, totalEntries, firstBreakAt, firstBreakId }`.
The timeline is a thin read over that — `AuditLogRepository.listByAction`
(backed by the existing `[tenantId, action]` index) reshaped into a wire
DTO. The audit log IS the durable record; a parallel table would be
redundant and risk drift.

## Files

| File | Role |
|------|------|
| `src/app-layer/repositories/AuditLogRepository.ts` | new `listByAction(db, ctx, action, limit)` — bounded, `[tenantId, action]`-indexed |
| `src/app-layer/usecases/inventory.ts` | new `listLedgerReconciliationHistory` + `LedgerReconciliationRun` DTO (audit-row → DTO mapping) |
| `src/app/t/[tenantSlug]/(app)/admin/ledger-integrity/page.tsx` | server page — history fetch + graceful degrade |
| `src/app/t/[tenantSlug]/(app)/admin/ledger-integrity/LedgerIntegrityClient.tsx` | client island — status hero + run button + history table |
| `src/app/t/[tenantSlug]/(app)/admin/page.tsx` | new "Ledger Integrity" nav pill |

## Decisions

- **`limit` not `take` as the repo param name** — the query-shape D2
  guardrail recognises bounded reads by a literal `take:` token; the
  `take` shorthand (`take,`) reads as unbounded. `take: limit` satisfies
  both the detector and eslint's object-shorthand rule.
- **Run → `router.refresh()`** rather than hand-merging the POST response
  into client state. The server re-render re-derives the hero + timeline
  from the freshly-written audit row, so there's one source of truth and
  no optimistic/actual skew.
- **Ratchet bumps** rather than fighting the page's natural shape: the
  page is registered in the ListPageShell / FilterToolbar /
  columns-dropdown EXEMPTIONS (status-hero + small fixed history table —
  not a filterable list), the lucide allowlist (admin surface is
  uniformly lucide), and the primary-count ceiling +1 (one earned CTA).
