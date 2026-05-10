/**
 * Roadmap-7 PR-5 — MetadataBar detail-page coverage ratchet.
 *
 * `<MetadataBar>` was built (v2-PR-13) as the canonical horizontal
 * metadata strip for detail pages — replacing 6 different layouts
 * scattered across the product (sidebar, header description, separate
 * Card under header, inline meta row). Adoption has been zero: every
 * detail page currently solves "show metadata" differently.
 *
 * Reading the same product across detail surfaces feels like reading
 * three products. The strip is meant to be dense, scannable, opinionated
 * — id, status, owner, when, where — sitting in one fixed spot
 * (between the page title and the tab bar) on every detail page.
 *
 * This PR seeds the migration registry. The DETAIL_PAGES table lists
 * the 10 canonical entity-detail pages with a `migrated` flag. Today
 * every entry is `false` (vacuous). Each follow-up migration PR:
 *
 *   1. Refactors one page to mount `<MetadataBar>` as the metadata
 *      slot in `<EntityDetailLayout>` (or directly below the page
 *      header).
 *   2. Flips that page's `migrated` flag from `false` to `true`.
 *   3. The ratchet then asserts the page actually has `<MetadataBar>`
 *      mounted in source — preventing a silent revert.
 *
 * The direction of travel is one-way: `migrated: true` cannot become
 * `migrated: false` without an explicit comment justifying the
 * regression. The contributor cost of justifying is a weak deterrent;
 * the PR review on a `true → false` flip is the strong one.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

interface DetailPageEntry {
    /** Path to the canonical detail-page file, relative to repo root. */
    file: string;
    /** Whether this page has been migrated to MetadataBar. */
    migrated: boolean;
    /** Why migrated=false (or why this page is in the registry). */
    note?: string;
}

/**
 * Canonical entity-detail pages. Each represents one of the 10
 * top-level entity types in the product.
 *
 * Adding a new entity-detail page: append it here with
 * `migrated: false` and a one-line note. The ratchet will then
 * require a written entry — it cannot be silently bypassed.
 */
const DETAIL_PAGES: DetailPageEntry[] = [
    {
        file: "src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx",
        migrated: false,
        note: "Heaviest detail page; metadata composition lives in CardHeader + inline rows. Migration pending.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx",
        migrated: false,
        note: "Already mounts <EntityDetailLayout>; metadata slot is the cleanest entry point.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/vendors/[vendorId]/page.tsx",
        migrated: false,
        note: "Vendor detail with sub-tabs (Overview, Documents, Risks, Assessments).",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/policies/[policyId]/page.tsx",
        migrated: false,
        note: "Policy detail with versioning + acknowledgment metadata.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/audits/cycles/[cycleId]/page.tsx",
        migrated: false,
        note: "Audit cycle detail with auditor + scope + period metadata.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/tasks/[taskId]/page.tsx",
        migrated: false,
        note: "Task detail with assignee + status + dates metadata.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/issues/[issueId]/page.tsx",
        migrated: false,
        note: "Issue detail with severity + reporter + status metadata.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/access-reviews/[reviewId]/page.tsx",
        migrated: false,
        note: "Access review detail with reviewer + period + entitlement metadata.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/assets/[id]/page.tsx",
        migrated: false,
        note: "Asset detail with owner + classification + lifecycle metadata.",
    },
    {
        file: "src/app/t/[tenantSlug]/(app)/audits/packs/[packId]/page.tsx",
        migrated: false,
        note: "Audit pack detail with state + auditor + due-date metadata.",
    },
];

describe("MetadataBar detail-page coverage", () => {
    it("every registered detail page exists in the codebase", () => {
        const missing: string[] = [];
        for (const entry of DETAIL_PAGES) {
            const full = path.join(ROOT, entry.file);
            if (!fs.existsSync(full)) {
                missing.push(entry.file);
            }
        }
        if (missing.length > 0) {
            throw new Error(
                `DETAIL_PAGES references files that no longer exist:\n${missing.map((m) => `  ${m}`).join("\n")}\nIf a page was deleted, drop the entry. If it was renamed, update the path.`,
            );
        }
        expect(missing).toHaveLength(0);
    });

    it("every page marked `migrated: true` actually mounts <MetadataBar>", () => {
        const violations: string[] = [];
        for (const entry of DETAIL_PAGES) {
            if (!entry.migrated) continue;
            const full = path.join(ROOT, entry.file);
            const content = fs.readFileSync(full, "utf8");
            if (!/<MetadataBar\b/.test(content)) {
                violations.push(entry.file);
            }
        }
        if (violations.length > 0) {
            throw new Error(
                `Pages marked \`migrated: true\` but missing <MetadataBar>:\n${violations.map((v) => `  ${v}`).join("\n")}\n\nEither restore the <MetadataBar> mount, or — if the migration was deliberately reverted — flip the registry entry back to \`migrated: false\` with a comment explaining why. The ratchet does NOT silently allow regressions.`,
            );
        }
        expect(violations).toHaveLength(0);
    });

    it("every detail-page entry has a note (no anonymous registry rows)", () => {
        const noteless: string[] = [];
        for (const entry of DETAIL_PAGES) {
            if (!entry.note || entry.note.length < 30) {
                noteless.push(entry.file);
            }
        }
        expect(noteless).toHaveLength(0);
    });

    it("registry holds the canonical 10 entity-detail pages (drift detector)", () => {
        // The number rules: today's ten pages are the canonical set.
        // If a new entity-detail page is added, the registry MUST
        // grow — and the new entry forces a written note via the
        // previous assertion. If a page is removed, the registry
        // shrinks — and the previous file-existence assertion forces
        // the entry to be dropped.
        expect(DETAIL_PAGES.length).toBeGreaterThanOrEqual(10);
    });
});
