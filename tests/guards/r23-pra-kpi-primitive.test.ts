/**
 * R23-PR-A — KpiFilterCard primitive extraction.
 *
 * Locks the four invariants the rest of R23 depends on:
 *   1. The shared primitive exists at the canonical path.
 *   2. It exports the expected API surface (label / value / onClick /
 *      selected at minimum).
 *   3. The Risks page consumes `<KpiFilterCard>` (it's the first
 *      consumer; PRs C-F roll the same primitive to 6 more pages).
 *   4. The Risks page no longer carries the inline
 *      `<Card><KPIStat /></Card>` pattern that PR-A extracted —
 *      otherwise future PRs could drift away from the shared
 *      primitive without anyone noticing.
 *
 * Why structural ratchet and not a render test: the visual contract
 * is owned by the Card + KPIStat primitives the new wrapper composes;
 * those already have their own coverage. The R23 risk is API drift —
 * a future PR that hand-rolls a sibling `KpiFilterCard2` and bypasses
 * the shared one. The four assertions below catch that class of bug.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const PRIMITIVE_PATH = 'src/components/ui/kpi-filter-card.tsx';
const RISKS_CLIENT_PATH =
    'src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx';

function read(rel: string): string {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('R23-PR-A — KpiFilterCard primitive', () => {
    it('the shared primitive exists at the canonical path', () => {
        expect(fs.existsSync(path.join(ROOT, PRIMITIVE_PATH))).toBe(true);
    });

    describe('API surface', () => {
        const src = read(PRIMITIVE_PATH);

        it('exports the KpiFilterCard component', () => {
            expect(src).toMatch(/export function KpiFilterCard\b/);
        });

        it('exports the KpiFilterCardProps interface', () => {
            expect(src).toMatch(/export interface KpiFilterCardProps\b/);
        });

        it('supports onClick (clickable card) prop', () => {
            expect(src).toMatch(/onClick\?\:\s*\(\)\s*=>\s*void/);
        });

        it('supports selected (active filter) prop', () => {
            expect(src).toMatch(/selected\?\:\s*boolean/);
        });

        it('supports the KPIStat tone bag (default/success/attention/critical)', () => {
            // Tone is forwarded to the underlying KPIStat. The
            // primitive imports MetricTone from `./metric` and exposes
            // it via the `tone` prop.
            expect(src).toMatch(/tone\?\:\s*MetricTone/);
            expect(src).toMatch(/from\s+["']@\/components\/ui\/metric["']/);
        });

        it('supports a description (secondary text below the value)', () => {
            expect(src).toMatch(/description\?\:/);
        });

        it('renders inside the shared Card primitive', () => {
            expect(src).toMatch(/from\s+["']@\/components\/ui\/card["']/);
            expect(src).toMatch(/<Card\b/);
        });

        it('keyboard accessibility — Enter and Space activate the click handler', () => {
            // The clickable branch must fire onClick on Enter or
            // Space, the canonical button-key contract.
            expect(src).toMatch(/onKeyDown/);
            expect(src).toMatch(/event\.key\s*===\s*["']Enter["']/);
            expect(src).toMatch(/event\.key\s*===\s*["']\s["']/);
        });

        it('selected state mirrors to aria-pressed', () => {
            // Screen readers need to announce the active toggle.
            expect(src).toMatch(/aria-pressed=\{selected\}/);
        });

        it('selected ring uses ring-inset (load-bearing for glass-card)', () => {
            // The Card chassis is `glass-card` (raised default), which
            // paints with `backdrop-filter: blur(...)`. Backdrop-filter
            // creates a stacking context clipped to the element's
            // border-radius box; an OUTSET `ring-2` extends 2px beyond
            // that box and Chrome's compositor draws the bottom rounded
            // corners inconsistently — the lower curve of the ring
            // fades visibly. `ring-inset` renders the ring INSIDE the
            // radius envelope, inside the same compositing layer as
            // the card's content, so every corner traces identically.
            //
            // A future refactor that drops `ring-inset` and goes back
            // to outset ring (or replaces the ring with `border-2`,
            // which would shift the card's effective dimensions) will
            // re-surface the same visibility bug on every consumer
            // page. Lock it here.
            //
            // CalendarMonth.tsx:214 shares the same recipe for the
            // same reason.
            expect(src).toMatch(
                /ring-2\s+ring-inset\s+ring-\[color:var\(--brand-default\)\]/,
            );
        });
    });

    describe('Risks page consumes the shared primitive', () => {
        const src = read(RISKS_CLIENT_PATH);

        it('imports KpiFilterCard from the shared module', () => {
            expect(src).toMatch(
                /import\s*\{\s*KpiFilterCard\s*\}\s*from\s+["']@\/components\/ui\/kpi-filter-card["']/,
            );
        });

        it('mounts KpiFilterCard (at least once)', () => {
            expect(src).toMatch(/<KpiFilterCard\b/);
        });

        it('does NOT import the legacy KPIStat directly on the Risks page', () => {
            // The Risks page used to import KPIStat + Card and inline
            // the KPI cards. PR-A extracts that pattern into the
            // shared primitive; the Risks page now imports
            // KpiFilterCard only. A future PR that re-introduces a
            // direct KPIStat import on the Risks page would mean the
            // shared primitive isn't being used — fail CI.
            expect(src).not.toMatch(
                /import[\s\S]*?\bKPIStat\b[\s\S]*?from\s+["']@\/components\/ui\/metric["']/,
            );
        });

        it('does NOT carry the inline `<Card><KPIStat /></Card>` KPI pattern', () => {
            // Strip comments so the explanatory header on
            // kpi-filter-card.tsx (which references the OLD pattern as
            // historical context) doesn't false-positive when the
            // Risks page imports nothing of the kind.
            const stripped = src
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            // A `<KPIStat />` JSX element on this page would mean the
            // page is bypassing the shared primitive.
            expect(stripped).not.toMatch(/<KPIStat\b/);
        });
    });
});
