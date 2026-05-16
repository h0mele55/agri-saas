/**
 * R22-PR-C — Icon discipline ratchet.
 *
 * Two small moves:
 *
 *   1. Per-size icon sizing scale. Icons used to be caller-sized
 *      (typically `h-4 w-4` regardless of button size). At xs
 *      (h-7 = 28px) a 16px icon dominates the row; at lg
 *      (h-10 = 40px) it disappears against the surrounding
 *      headline-weight text. PR-C adds `[&_svg]:size-N` to each
 *      size variant — the descendant selector OVERRIDES any svg
 *      child's own h-N/w-N so the default icon scales with the
 *      button. Callers can still pass icons sized smaller; the
 *      per-size class gives the default the right rhythm.
 *
 *      xs/sm  size-3.5 (14px) — quiet in dense rows
 *      md     size-4   (16px) — confident default
 *      lg     size-[18px]      — featured CTA, headline weight
 *
 *   2. `[&_svg]:shrink-0` on the cva base. Defensive Tailwind
 *      pattern that keeps icons from being squished in dense
 *      flex contexts (e.g. a filter-toolbar row tight on
 *      horizontal space).
 *
 * Not in scope: gap progression refinement (PR-D / iteration
 * material) and right-icon micro-shift on hover (motion-language
 * banned `group-hover:translate-*`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const VARIANTS = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/button-variants.ts'),
    'utf8',
);

function sizeBlock(): string {
    return VARIANTS.match(/size:\s*\{([\s\S]*?)\},?\s*\}/)?.[1] ?? '';
}
function sizeClasses(size: 'xs' | 'sm' | 'md' | 'lg'): string {
    const re = new RegExp(`${size}:\\s*["']([^"']+)["']`);
    return sizeBlock().match(re)?.[1] ?? '';
}

describe('R22-PR-C — Icon discipline', () => {
    describe('cva base — defensive shrink-0 on svg children', () => {
        it('the cva base carries `[&_svg]:shrink-0`', () => {
            const base =
                VARIANTS.match(/cva\(\s*\[([\s\S]*?)\]\s*,/)?.[1] ?? '';
            expect(base).toMatch(/\[&_svg\]:shrink-0/);
        });
    });

    describe('per-size icon sizing scale', () => {
        it('xs uses `[&_svg]:size-3.5` (14px in a 28px button)', () => {
            expect(sizeClasses('xs')).toMatch(/\[&_svg\]:size-3\.5\b/);
        });

        it('sm uses `[&_svg]:size-3.5` (14px in a 32px button)', () => {
            expect(sizeClasses('sm')).toMatch(/\[&_svg\]:size-3\.5\b/);
        });

        it('md uses `[&_svg]:size-4` (16px in a 36px button — default)', () => {
            expect(sizeClasses('md')).toMatch(/\[&_svg\]:size-4\b/);
        });

        it('lg uses `[&_svg]:size-[18px]` (18px in a 40px button — featured CTA)', () => {
            expect(sizeClasses('lg')).toMatch(/\[&_svg\]:size-\[18px\]/);
        });

        it('the four sizes form a monotonically-increasing icon scale', () => {
            // Strip any non-icon classes — focus on the icon
            // size class only. The progression should read
            // 3.5 → 3.5 → 4 → 18, never going down.
            const iconClass = (s: 'xs' | 'sm' | 'md' | 'lg') =>
                sizeClasses(s).match(/\[&_svg\]:size-(\S+)/)?.[1] ?? '';
            const xs = iconClass('xs');
            const sm = iconClass('sm');
            const md = iconClass('md');
            const lg = iconClass('lg');
            expect(xs).toBeTruthy();
            expect(sm).toBeTruthy();
            expect(md).toBeTruthy();
            expect(lg).toBeTruthy();
            // Hardcoded shape check — xs==sm < md < lg.
            expect(xs).toBe(sm);
            expect(xs).toBe('3.5');
            expect(md).toBe('4');
            expect(lg).toBe('[18px]');
        });
    });
});
