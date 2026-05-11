/**
 * Roadmap-11 PR-11 — Chart animation polish lock.
 *
 * Charts feel polished when their transitions animate with a
 * consistent easing curve. Pre-R11 the DonutChart used
 * `transition-all duration-500` with no easing — the default
 * `linear` curve gives a robotic segment expansion.
 *
 * R11-PR11 locks `ease-out` on every chart primitive's transition,
 * pairing with R11-PR5's animation-language ratchet. `ease-out`
 * matches the "settles into place" expectation users have for
 * data-viz transitions; `linear` or `ease-in-out` are wrong tone.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');

/** Chart primitives that should carry the polished transition. */
const CHART_PRIMITIVES = [
    'src/components/ui/DonutChart.tsx',
    'src/components/ui/mini-area-chart.tsx',
];

describe('Chart animation polish lock (R11-PR11)', () => {
    test('every chart primitive that uses transition-all also uses ease-out', () => {
        const offenders: string[] = [];
        for (const rel of CHART_PRIMITIVES) {
            const abs = path.resolve(ROOT, rel);
            if (!fs.existsSync(abs)) continue;
            const src = fs.readFileSync(abs, 'utf-8');
            // If the file uses `transition-all`, every site should
            // also carry an `ease-` token nearby (within the same
            // className-string). The pragmatic check: a global count
            // of `transition-all` should be ≤ the count of
            // `transition-all ... ease-`.
            const transitionAllCount = (
                src.match(/transition-all/g) ?? []
            ).length;
            if (transitionAllCount === 0) continue;
            const withEasing = (
                src.match(/transition-all[^"'`\n]*ease-[a-z-]+/g) ?? []
            ).length;
            if (withEasing < transitionAllCount) {
                offenders.push(
                    `${rel} (${transitionAllCount} transition-all, ${withEasing} carry an ease- token)`,
                );
            }
        }
        if (offenders.length > 0) {
            throw new Error(
                `${offenders.length} chart primitive(s) use \`transition-all\` without a paired ease- token:\n  ` +
                    offenders.join('\n  ') +
                    '\n\nFix: append ` ease-out` (or another locked easing keyword) to the className alongside `transition-all`.',
            );
        }
    });

    test('DonutChart segment transition uses ease-out specifically', () => {
        const src = fs.readFileSync(
            path.resolve(ROOT, 'src/components/ui/DonutChart.tsx'),
            'utf-8',
        );
        // The exact class string on the segment circles. Locks the
        // polish so a future "tidy-up" can't strip the easing.
        expect(src).toMatch(/transition-all\s+duration-500\s+ease-out/);
    });
});
