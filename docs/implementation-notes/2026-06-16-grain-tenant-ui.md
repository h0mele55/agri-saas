# 2026-06-16 — Enterprise-grain tenant UI (contracts, bins, yield, costs)

**Commit:** `<sha>` feat(grain): tenant grain UI — contracts, bins, yield, costs pages + nav

## Design

The per-tenant UI layer over the enterprise-grain backend (usecases + API
routes + DTOs shipped in #36). Four surfaces under
`/t/:slug/(app)/grain/*`, gated as one route group behind the `GRAIN`
module:

```
grain/layout.tsx ── requireModule(ctx, 'GRAIN')  (redirect twin of the API gate)
   ├── contracts/  EntityListPage + create/edit Modal + undo-delete   (full CRUD)
   ├── bins/        EntityListPage + create/edit Modal (ProgressBar fill)  (no delete route)
   ├── yield/       EntityListPage + create/edit Modal + undo-delete   (full CRUD)
   └── costs/       ListPageShell + ToggleGroup(planting|field|season)  (read-only report)
```

Each list page is a thin client island over the existing API: the server
`page.tsx` calls the list usecase for initial data and hydrates React
Query; the client owns filters, the create/edit modal, and (where a DELETE
route exists) optimistic undo-delete. The Costs page is NOT an
`EntityListPage` — it's a read-only aggregation digest with a dimension
toggle, so it composes `ListPageShell` directly.

The tenant nav "Grain" section (removed in #36 when the pages didn't exist)
is restored — its links now resolve to real pages.

## Files

| File | Role |
|---|---|
| `grain/layout.tsx` | one route-group `requireModule('GRAIN')` gate for all nested pages |
| `grain/contracts/{page,ContractsClient,ContractFormModal,filter-defs}.tsx` | contracts CRUD list + dual create/PATCH modal + status/type facets |
| `grain/bins/{page,BinsClient,BinFormModal}.tsx` | bins list with `ProgressBar` fill + create/edit (RadioGroup kind) |
| `grain/yield/{page,YieldClient,YieldFormModal,filter-defs}.tsx` | yield CRUD list + FK comboboxes (planting/field/season) |
| `grain/costs/{page,CostsClient}.tsx` | read-only cost rollup report, dimension toggle |
| `components/layout/SidebarNav.tsx` | restored the gated "Grain" nav section |
| `tests/unit/{contracts,bins,yield}-list-shell-adoption.test.ts` | per-page shell-adoption ratchets |

## Decisions

- **One route-group `layout.tsx` gate**, not per-page — mirrors the
  PLANNING module. The API routes still enforce `GRAIN` server-side, so
  the page gate is defence-in-depth + a clean redirect, not the only
  check.
- **Contract Decimals are strings on the wire.** `listContracts` returns
  the raw Prisma model, so `volumeTonnes`/`pricePerTonne` serialise as
  JSON strings. The contract row type carries them as `string | null`,
  parsed with `Number(...)` only at display; the form coerces text →
  `number | null` (empty → `null`, never `0`). Bin/yield DTOs are
  pre-mapped to numbers by their usecases.
- **Bin fill uses the shared `ProgressBar`**, not an inline
  `style={{ width }}` bar — required by the Epic-59 chart-bypass guard
  and keeps the fill colour on the semantic warning/success tokens.
- **Costs is a report, not a CRUD list** — no create button, no faceted
  filter, no per-column gear. It's exempted (with written reasons) from
  the filter-toolbar and columns-dropdown ratchets, alongside the other
  read-only aggregation digests.
- **Optional FK selects use a prepended `{ value:'', label:'No …' }`
  sentinel** to clear the relation — the shared `Combobox` has no
  built-in clear affordance. Empty string maps back to `null` on submit.
- **Bins have create + edit only** — the backend ships no bin DELETE
  route (a bin is a `Location`; deleting storage with lots in it is a
  separate lifecycle concern), so the bins page wires no delete action
  and its shell-adoption test asserts that absence.
- **Blending UI deferred** — the `/grain/blend` endpoint stays
  API-only; a multi-lot blend picker needs an items API that doesn't
  exist yet.
