# 2026-05-24 — B8 folders + framework lifecycle

**Commit:** `<sha> feat(b8): folders + framework linkage + framework-lifecycle CTAs`

## Design

B8 of the 10-bundle 26-item roadmap. Three independent slices, each
small enough to land in the same PR without ballooning the surface:

1. **VendorDocument.folder** — free-text tag a tenant can assign to
   each vendor document so the list groups by their own
   organisational scheme. Nullable, indexed on
   `(tenantId, vendorId, folder)`. The vendor detail page surfaces a
   Folder input (datalist-seeded with values already in use) + a
   Folder filter Combobox (derived from the loaded docs).

2. **Audit.frameworkKey** — nullable link from `Audit` to
   `Framework.key`. The link is a string column, not an FK, so an
   audit survives a global framework re-key. Surfaced in the
   create-audit modal via a Combobox loaded from
   `/api/t/<slug>/frameworks` on open. Indexed on
   `(tenantId, frameworkKey)` for "show me every audit against
   ISO27001" lookups. Backfill not required — existing rows read
   null.

3. **Framework lifecycle CTAs** — the frameworks list page gains:
     * an **Import framework** primary CTA pointing at the first
       uninstalled framework's `/install` page (the existing pack
       install flow, surfaced more prominently);
     * a **Create framework** secondary CTA that opens a placeholder
       modal documenting why custom frameworks are deferred (the
       Framework model is global; tenant-scoped custom frameworks
       require a `tenantId` column + matching RLS policies and a
       larger redesign).

## Files

| File | Role |
| --- | --- |
| `prisma/schema/vendor.prisma` | `VendorDocument.folder` + index |
| `prisma/schema/audit.prisma` | `Audit.frameworkKey` + index |
| `prisma/migrations/20260524170000_…/migration.sql` | Hand-written DDL (`prisma migrate dev` is broken in-harness; see project memory) |
| `src/lib/schemas/index.ts` | `CreateVendorDocumentSchema.folder` + `CreateAuditSchema.frameworkKey` |
| `src/lib/schemas/audit-form.ts` | `NewAuditFormSchema.frameworkKey` |
| `src/app-layer/usecases/vendor.ts` | sanitise + persist `folder` |
| `src/app-layer/usecases/audit.ts` | accept + sanitise `frameworkKey` |
| `src/app-layer/repositories/VendorRepository.ts` | empty-coerce `folder` |
| `src/app/t/[tenantSlug]/(app)/vendors/[vendorId]/page.tsx` | Folder input + filter + table column |
| `src/app/t/[tenantSlug]/(app)/audits/_form/useNewAuditForm.ts` | thread `frameworkKey` |
| `src/app/t/[tenantSlug]/(app)/audits/_form/NewAuditFields.tsx` | framework Combobox |
| `src/app/t/[tenantSlug]/(app)/frameworks/FrameworksClient.tsx` | Import + Create CTAs |
| `tests/guardrails/b8-folders-frameworks.test.ts` | 21 structural assertions |

## Decisions

* **Folder is a string, not an entity.** A `DocumentFolder` table
  would carry per-folder permissions, sharing, and a real tree —
  none of which the user asked for at this stage. A string label
  with a datalist gives the orientation benefit and falls back to
  "no folder" naturally; the schema can grow into an entity later
  without a UI change.

* **Audit-to-Framework uses `key`, not an FK.** Framework rows are
  global and immutable from the app's perspective, but the unique
  index is on `(key, version)` — referring by `key` means an audit
  survives a re-key better than a hard `frameworkId` FK would. Cost:
  we can't `INCLUDE` a Framework join naturally; a dedicated
  `getAuditFramework` lookup is the path when we need the joined
  row.

* **Custom frameworks deferred.** Adding `Framework.tenantId` would
  touch RLS (the global table currently has no tenant policies),
  every `listFrameworks` reader (filter by `tenantId IS NULL OR
  tenantId = current`), and the FrameworkRequirement chain. That's
  a whole roadmap on its own — not B8 scope. The Create CTA is a
  signpost, not a stub: it explicitly documents the design and
  points to the today-answer (import + customise per-requirement).

* **`prisma migrate dev` workaround.** The project memory notes
  `prisma migrate dev` is broken in-harness; the canonical workflow
  is to hand-write the SQL and `prisma migrate deploy` it. Followed
  here. The DDL is two `ALTER TABLE ADD COLUMN`s + two
  `CREATE INDEX`es — no downgrade-unsafe operations.
