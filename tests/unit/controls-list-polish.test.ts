/**
 * Structural ratchet — Controls list UX polish.
 *
 * Locks the five visible-change deltas applied after Epic 91's
 * structural-only refactor:
 *
 *   1. Owner column renders an avatar + name + email chip (data
 *      already comes back from the repo's `owner` include).
 *   2. Status pill is now a `<select>` covering every ControlStatus
 *      enum value, not a four-state cycle button.
 *   3. Applicability pill is a `<select>` whose N/A option opens the
 *      existing justification modal.
 *   4. Evidence column carries a `<Paperclip>` icon next to the count.
 *   5. The DataTable's `batchActions` are wired with the bulk-status
 *      operations (Mark Implemented / Needs Review / Not Applicable).
 *
 * This is a string-scan ratchet — same shape as
 * `controls-client-shell-adoption.test.ts`. It runs in the node
 * project so it doesn't need a jsdom mount.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

const CONTROLS_CLIENT = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx',
);
const source = readFileSync(CONTROLS_CLIENT, 'utf8');

describe('Controls list — UX polish', () => {
    describe('Owner column', () => {
        it('renders a chip with name + email + initial avatar', () => {
            // Avatar circle uses the first character of the display
            // string; locking this so a future "tidy-up" can't drop
            // the avatar back to a plain text cell.
            expect(source).toContain("data-testid={`control-owner-${c.id}`}");
            expect(source).toMatch(/charAt\(0\)\.toUpperCase\(\)/);
            // Name + email both render when available; em-dash for
            // unowned controls.
            expect(source).toMatch(/c\.owner\.name\s*\?\?\s*c\.owner\.email/);
            expect(source).toContain('text-content-subtle');
        });
    });

    describe('Status select (replaces cycle button)', () => {
        it('exposes ALL ControlStatus enum values in the dropdown', () => {
            // The legacy cycle was 4 statuses. The new select reads
            // off ALL_STATUSES (the prisma enum mirror). Drift here
            // would silently shrink the editable set.
            expect(source).toContain('ALL_STATUSES');
            for (const s of [
                'NOT_STARTED',
                'PLANNED',
                'IN_PROGRESS',
                'IMPLEMENTING',
                'IMPLEMENTED',
                'NEEDS_REVIEW',
                'NOT_APPLICABLE',
            ]) {
                expect(source).toContain(`'${s}'`);
            }
        });

        it('renders as a <select id="status-pill-{id}"> not a <button>', () => {
            // E2E selector contract preserved as the element-type
            // changes; a future revert to <button> would break the
            // selector + the new keyboard a11y story.
            expect(source).toMatch(
                /<select\s+id=\{`status-pill-\$\{c\.id\}`\}/,
            );
        });

        it('reader without edit permission sees a static StatusBadge', () => {
            // The interactive control is gated by appPermissions —
            // READER falls through to a static <StatusBadge> render.
            // Updated in PR-2 from the legacy <span className="badge ...">
            // to the canonical <StatusBadge variant={STATUS_BADGE[...]}>.
            expect(source).toMatch(
                /if \(!appPermissions\.controls\.edit\)\s*\{[\s\S]{0,200}<StatusBadge variant=\{STATUS_BADGE/,
            );
        });
    });

    describe('Applicability select', () => {
        it('renders as a <select id="applicability-pill-{id}">', () => {
            expect(source).toMatch(
                /<select\s+id=\{`applicability-pill-\$\{c\.id\}`\}/,
            );
        });

        it('NOT_APPLICABLE opens the justification modal (legacy flow preserved)', () => {
            // Picking N/A still routes through the existing
            // setJustificationModal flow — the Save button there
            // commits the mutation; pure dropdown changes for
            // APPLICABLE go straight to the mutation.
            expect(source).toContain('setJustificationModal({');
            expect(source).toMatch(
                /next === 'NOT_APPLICABLE'[\s\S]{0,300}setJustificationModal/,
            );
        });
    });

    describe('Evidence count column', () => {
        it('renders a Paperclip icon next to the count', () => {
            expect(source).toMatch(
                /import\s*\{[^}]*\bPaperclip\b[^}]*\}\s*from\s*['"]lucide-react['"]/,
            );
            expect(source).toMatch(/<Paperclip\s/);
            expect(source).toContain("data-testid={`control-evidence-${row.original.id}`}");
        });
    });

    describe('Bulk actions', () => {
        it('wires three batch actions (Mark Implemented / Needs Review / Not Applicable)', () => {
            // Permission-gated array; READER sees no toolbar at all.
            expect(source).toContain(
                'batchActions: appPermissions.controls.edit',
            );
            expect(source).toContain("label: 'Mark Implemented'");
            expect(source).toContain("label: 'Mark Needs Review'");
            expect(source).toContain("label: 'Mark Not Applicable'");
        });

        it('the destructive Mark-Not-Applicable action carries variant=danger', () => {
            // Same shape Epic 52's BatchAction contract uses; locks
            // in that the visual treatment doesn't drift.
            expect(source).toMatch(
                /label: 'Mark Not Applicable'[\s\S]{0,400}variant: 'danger'/,
            );
        });
    });
});
