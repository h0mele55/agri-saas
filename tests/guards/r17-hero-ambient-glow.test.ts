/**
 * R17-PR1 — HeroMetric ambient brand glow.
 *
 * The dashboard masthead carries a 72px verdict number (v2-PR-10).
 * The card chassis was flat — no warmth, no life. PR-1 adds a soft
 * radial wash anchored under the value (left bias, vertical
 * centre), brand-subtle alpha fading to transparent. Static here;
 * PR-2 layers the breath animation on top of the same gradient.
 *
 * Three load-bearing invariants:
 *
 *   1. The `<section>` carries `relative isolate overflow-hidden`
 *      so the `before:` pseudo's `-z-10` resolves against a local
 *      stacking context AND the glow stays clipped to the card.
 *      Without `isolate`, `-z-10` would push the glow behind the
 *      page background and it would not render. Without
 *      `overflow-hidden`, the soft edge spills past the card
 *      border on mobile widths.
 *
 *   2. The `before:` pseudo carries the exact radial-gradient
 *      shape: `ellipse 640x400 at 18% 60%`, brand-subtle at 0%
 *      fading to transparent at 72%. The "18% / 60%" placement
 *      anchors under the 72px value's vertical centre, the "640
 *      × 400" sizes the wash to read as ambient (not as a hard
 *      shape), and the "72%" fade keeps the right-hand area
 *      (delta chip + CTA) clean.
 *
 *   3. The `data-hero-ambient-glow` attribute is present. The
 *      rendered DOM is the contract surface for later PRs
 *      (PR-2 breath animation, PR-3 delta chip + sparkline) to
 *      identify the glow layer.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const HERO_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/HeroMetric.tsx'),
    'utf8',
);

describe('R17-PR1 — HeroMetric ambient glow', () => {
    it('section wrapper carries `relative isolate overflow-hidden`', () => {
        expect(HERO_SRC).toMatch(
            /"relative\s+isolate\s+overflow-hidden"/,
        );
    });

    it('section wrapper carries the `before:` pseudo with -z-10 + pointer-events-none', () => {
        expect(HERO_SRC).toMatch(
            /before:content-\[''\][\s\S]*?before:-z-10[\s\S]*?before:pointer-events-none/,
        );
    });

    it('the radial-gradient is anchored at 18% 60% with brand-subtle → transparent', () => {
        expect(HERO_SRC).toMatch(
            /before:bg-\[radial-gradient\(ellipse_640px_400px_at_18%_60%,\s*var\(--brand-subtle\)_0%,\s*transparent_72%\)\]/,
        );
    });

    it('the rendered DOM exposes `data-hero-ambient-glow` for downstream PRs', () => {
        // PR-2 will target this attribute to attach the breath
        // animation; PR-3 will sit the delta-chip + sparkline
        // relative to it.
        expect(HERO_SRC).toMatch(/data-hero-ambient-glow/);
    });
});
