/**
 * Epic 56 — ad-hoc clipboard ratchet.
 *
 * All product surfaces must copy through the shared primitives:
 *   - `useCopyToClipboard` (src/components/ui/hooks/use-copy-to-clipboard.tsx)
 *   - `<CopyButton>` (src/components/ui/copy-button.tsx)
 *   - `<CopyText>`   (src/components/ui/copy-text.tsx)
 *
 * Those three files are the only legitimate callers of
 * `navigator.clipboard.writeText` / `navigator.clipboard.write` in the
 * codebase. Anywhere else represents a regression: bespoke copy loses
 * SSR safety, the legacy execCommand fallback, typed error reporting,
 * and the shared success/error feedback contract (toast + flash state).
 *
 * This guard scans the whole `src/` tree. Violations list the file and
 * line so the author can migrate to the hook.
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '../../src');

// Legitimate call sites — the shared primitive implementations.
const ALLOWLIST = new Set(
    [
        'components/ui/hooks/use-copy-to-clipboard.tsx',
        // PR-B polish — canvas-image clipboard write. The existing
        // `useCopyToClipboard` hook is text-only; copying a PNG
        // requires `ClipboardItem` with an `image/png` blob. Adding
        // image support to the hook would change its contract for
        // every text caller, so the canvas-export helper holds the
        // image-clipboard call on its own.
        'lib/processes/canvas-export.ts',
    ].map((p) => path.resolve(SRC_ROOT, p)),
);

const PATTERN = /navigator\.clipboard\.(writeText|write)\s*\(/;

function walk(dir: string, out: string[]): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.next') continue;
            walk(full, out);
        } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
            out.push(full);
        }
    }
    return out;
}

describe('Epic 56 — no bespoke clipboard calls outside the primitive', () => {
    it('navigator.clipboard.writeText is only used inside the shared hook', () => {
        const files = walk(SRC_ROOT, []);
        const violations: string[] = [];

        for (const file of files) {
            if (ALLOWLIST.has(file)) continue;
            const src = fs.readFileSync(file, 'utf-8');
            src.split('\n').forEach((line, i) => {
                if (PATTERN.test(line)) {
                    const rel = path.relative(SRC_ROOT, file);
                    violations.push(`${rel}:${i + 1}  ${line.trim()}`);
                }
            });
        }

        expect(violations).toEqual([]);
    });
});
