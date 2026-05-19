/**
 * Ratchet — translation labels MUST NOT lead with `+ `.
 *
 * The `+ Asset` / `+ Risk` / `+ Audit` antipattern (literal "+"
 * baked into the translation string) bypasses the cva centering
 * logic: the "+" becomes part of the centered text block, so the
 * button reads visually unbalanced — text wants to centre as a
 * unit, but the "+" character has different visual weight than
 * the noun next to it, pulling the eye left.
 *
 * Per CLAUDE.md "Action button vocabulary": the icon belongs to
 * the button's `icon` slot, never the text. Translation values
 * use the canonical verb form ("Create Asset" / "Add Asset" /
 * "New Audit") and the Plus glyph is passed via `icon={<Plus />}`
 * at the call site. The Button cva then centers icon + label as
 * a properly balanced flex group.
 *
 * Scans every `messages/*.json` and fails CI if any value starts
 * with `"+ "`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const MESSAGES_DIR = path.resolve(__dirname, '../../messages');

function flatten(obj: unknown, prefix = ''): Array<[string, string]> {
    const out: Array<[string, string]> = [];
    if (obj === null || typeof obj !== 'object') return out;
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof val === 'string') {
            out.push([path, val]);
        } else if (typeof val === 'object') {
            out.push(...flatten(val, path));
        }
    }
    return out;
}

describe('Translation labels — no "+ " prefix antipattern', () => {
    const files = fs
        .readdirSync(MESSAGES_DIR)
        .filter((f) => f.endsWith('.json'));

    it('found at least one translation file to scan', () => {
        expect(files.length).toBeGreaterThan(0);
    });

    for (const file of files) {
        it(`${file} has no values starting with "+ "`, () => {
            const raw = fs.readFileSync(
                path.join(MESSAGES_DIR, file),
                'utf8',
            );
            const json = JSON.parse(raw) as unknown;
            const violations = flatten(json).filter(([, v]) =>
                /^\+\s/.test(v),
            );
            // Print actionable diff if any violation is found —
            // the developer sees `key: "+ Asset"` not a counter.
            expect(violations).toEqual([]);
        });
    }
});
