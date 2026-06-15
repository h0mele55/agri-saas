# 2026-06-14 — Knowledge Base (versioned SOPs + growing guides)

**Commit:** `feat(knowledge-base): versioned articles on the IC Policy machinery`
**Branch:** `feat/knowledge-base` (built on `feat/farm-tasks`).

## Design

Workers need versioned SOPs + growing guides they can read and acknowledge.
Rather than build a CMS, this **repurposes IC's Policy machinery**:
`KnowledgeArticle` / `KnowledgeArticleVersion` / `KnowledgeAcknowledgement`
mirror `Policy` / `PolicyVersion` / `PolicyAcknowledgement`, and the usecases
mirror `createPolicy` / `createPolicyVersion` / `publishPolicy` /
`attestPolicy`.

```
  createArticle ─▶ DRAFT (+ v1)
        │  createArticleVersion ─▶ vN+1, PUBLISHED→DRAFT rollback
        ▼  publishArticle(versionId) ─▶ PUBLISHED (currentVersion=vN,
        │                               lifecycleVersion++)
        ▼  acknowledgeArticle (worker) ─▶ read-receipt (per version+user)
           archiveArticle ─▶ ARCHIVED
```

Simpler lifecycle than Policy: the IN_REVIEW/APPROVED approval gate, the
SharePoint sync, templates, and PDF export are all dropped. Kept: the
slug-collision loop, version auto-increment, the PUBLISHED→DRAFT rollback on
new-version, content sanitisation on write (HTML→`sanitizeRichTextHtml`,
MARKDOWN→`sanitizePlainText`), and the idempotent acknowledgement (unique on
`[articleVersionId, userId]`).

**Search.** Articles join the unified search surface: a `knowledge`
`SearchHitType`, a `db.knowledgeArticle.findMany` branch in `getUnifiedSearch`,
a hit builder (`/knowledge/{id}` href), and `SEARCH_TYPE_DEFAULTS` +
command-palette `ENTITY_META` (BookOpen heading) registrations.

**Seed.** `scripts/import-knowledge.ts` (`npm run import:knowledge`) seeds 6
CC0 growing guides (OpenFarm-modelled crop data — public domain) as PUBLISHED
articles, idempotent on `(tenantId, slug)`, authored by the tenant's first
active OWNER/ADMIN, with `source = "OpenFarm (CC0)"`.

## Files

| File | Role |
|------|------|
| `prisma/schema/knowledge.prisma` | the 3 models (all carry `tenantId` → direct RLS, unlike Policy's chained ack table) |
| `prisma/schema/enums.prisma` | `KnowledgeArticleStatus` (DRAFT/PUBLISHED/ARCHIVED), `KnowledgeContentType` (HTML/MARKDOWN) |
| `prisma/schema/auth.prisma` | Tenant/User back-relations |
| `prisma/migrations/20260614211943_knowledge_base/` | hand-stripped of drift; tables + the RLS trio (a `DO $$` loop over the 3 tables) |
| `src/app-layer/repositories/Knowledge{,Version}Repository.ts` | mirror Policy{,Version}Repository |
| `src/app-layer/usecases/knowledge.ts` | create/version/publish/archive/list/get + acknowledge/listAcknowledgements |
| `src/app/api/t/[tenantSlug]/knowledge/**` | list/create, detail, versions, publish, acknowledge, archive, categories |
| `src/lib/search/types.ts`, `usecases/search.ts`, `palette/{filter,recents}.ts`, `search/rank.ts`, `command-palette.tsx` | `knowledge` search type wired end-to-end |
| `scripts/import-knowledge.ts` + `package.json` | CC0 growing-guide seed + `import:knowledge` |
| `THIRD_PARTY_NOTICES.md` | OpenFarm (CC0) data + frappe/wiki (feature shape) |
| `src/app/t/[tenantSlug]/(app)/knowledge/**` | list + detail UI (read + acknowledge) |

## Decisions

- **Repurpose over rebuild.** The usecases import nothing from `policy.ts` (to
  keep the simpler lifecycle clean) but follow its exact shape — slug loop,
  sanitise-on-write, version rollback, idempotent ack. The schema mirrors
  Policy field-for-field minus the approval/SharePoint columns.
- **All three tables carry `tenantId`** (direct RLS trio) where
  `PolicyAcknowledgement` is ownership-chained — consistent with the rest of
  the ag stack and avoids the chained-RLS policy shape.
- **No approval gate.** Knowledge is operational guidance, not a controlled
  compliance document; a draft → publish flow (admin publishes) is enough. The
  Policy bypass-reason machinery would be dead weight.
- **Catalog content seeded, not fetched.** The seed embeds CC0 OpenFarm crop
  data rather than calling the OpenFarm/Growstuff API at seed time — no network
  dependency, deterministic, and CC0 permits redistribution.
- **`knowledge` reuses the `file-text` iconKey** (the palette group heading
  carries its own BookOpen icon) — no new `SearchHit.iconKey` union member, so
  no glyph-map churn.
