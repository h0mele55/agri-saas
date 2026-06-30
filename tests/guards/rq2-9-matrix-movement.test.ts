/**
 * RQ2-9 — matrix-movement ratchet.
 *
 * Regression classes guarded:
 *
 *   - the risks list dropping the decomposed residual dims from its
 *     select;
 *   - the RiskMatrix component's movement overlay losing its zero-cost
 *     gate or its dedupe.
 *
 * NOTE: the risks-page inline heatmap (which fed `matrixMovements` to the
 * matrix) was removed, so the client no longer wires movements. The
 * RiskMatrix *component* keeps its movement-overlay support for the admin
 * matrix-config surface; this guard protects that + the repo select.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

const repo = read('src/app-layer/repositories/RiskRepository.ts');
const client = read('src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx');
const matrix = read('src/components/ui/RiskMatrix.tsx');

describe('RQ2-9 — inherent → residual movement', () => {
    test('the list select ships the decomposed residual dims', () => {
        for (const f of ['residualLikelihood: true', 'residualImpact: true']) {
            expect(repo).toContain(f);
        }
    });

    test('the risks page no longer wires the inline matrix movement overlay', () => {
        // The 'heatmap' view was removed; its `matrixMovements` memo and
        // `movements={matrixMovements}` wiring must not reappear.
        expect(client).not.toMatch(/const matrixMovements/);
        expect(client).not.toMatch(/movements=\{matrixMovements\}/);
    });

    test('the matrix component keeps its movement overlay + zero-cost gate', () => {
        expect(matrix).toMatch(/hasMovements && \(/);
        expect(matrix).toMatch(/movementActive && \(/);
    });

    test('identical paths dedupe into counted arrows; same-cell pairs skipped', () => {
        expect(matrix).toMatch(/byPath/);
        expect(matrix).toMatch(/m\.from\.likelihood === m\.to\.likelihood && m\.from\.impact === m\.to\.impact\) continue;/);
    });

    test('the overlay never intercepts cell clicks', () => {
        const overlay = matrix.slice(
            matrix.indexOf('risk-matrix-movement-overlay'),
            matrix.indexOf('</svg>', matrix.indexOf('risk-matrix-movement-overlay')),
        );
        expect(matrix.slice(matrix.indexOf('movementActive && ('), matrix.indexOf('movementArrows.map'))).toMatch(/pointer-events-none/);
        expect(overlay.length).toBeGreaterThan(0);
    });
});
