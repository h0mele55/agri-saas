/**
 * Validity of the concept-only certification-scheme catalogs that
 * `scripts/import-schemes.ts` (`npm run schemes:import`) applies.
 *
 * Loads + cross-validates each YAML against `CatalogFileSchema` (no DB),
 * and asserts the cross-links the schema alone can't (the
 * AUTO_EVIDENCE_RULES requirement codes really exist in the catalogs, the
 * frameworks are AG_SCHEME, the text is marked illustrative).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    loadAndValidateCatalogFile,
    CatalogValidationError,
} from '../../prisma/catalog-loader';
import { AUTO_EVIDENCE_RULES } from '@/app-layer/usecases/auto-evidence';

const CATALOG_DIR = path.resolve(__dirname, '..', '..', 'prisma', 'catalogs');

/** Illustrative scheme catalogs added alongside the original two. */
const NEW_SCHEME_FILES = ['leaf-marque-demo.yaml', 'red-tractor-demo.yaml'];

const SCHEME_FILES = [
    'globalgap-ifa-demo.yaml',
    'eu-organic-2018-848-demo.yaml',
    ...NEW_SCHEME_FILES,
];

describe('scheme catalogs — load + validate', () => {
    test.each(SCHEME_FILES)('%s parses + cross-validates against CatalogFileSchema', (fileName) => {
        const file = loadAndValidateCatalogFile(path.join(CATALOG_DIR, fileName));

        // Each scheme is an AG_SCHEME framework with ≥1 requirement + a pack.
        expect(file.framework.kind).toBe('AG_SCHEME');
        expect(file.requirements.length).toBeGreaterThan(0);
        expect(file.pack).toBeDefined();

        // LICENSE hygiene — the framework description marks it illustrative /
        // concept-only / paraphrased (so it isn't mistaken for the real checklist).
        expect(file.framework.description ?? '').toMatch(/illustrative|concept|paraphrased/i);
    });

    it('GlobalG.A.P. catalog defines the CB.7 plant-protection requirement codes', () => {
        const file = loadAndValidateCatalogFile(path.join(CATALOG_DIR, 'globalgap-ifa-demo.yaml'));
        expect(file.framework.key).toBe('GLOBALGAP-IFA-DEMO');
        const codes = new Set(file.requirements.map((r) => r.code));
        for (const c of ['CB.7.1', 'CB.7.6', 'CB.7.9']) {
            expect(codes.has(c)).toBe(true);
        }
    });

    it('EU-Organic catalog defines the permitted-input + records codes', () => {
        const file = loadAndValidateCatalogFile(path.join(CATALOG_DIR, 'eu-organic-2018-848-demo.yaml'));
        expect(file.framework.key).toBe('EU-ORGANIC-2018-848-DEMO');
        const codes = new Set(file.requirements.map((r) => r.code));
        for (const c of ['EUO.2', 'EUO.3']) {
            expect(codes.has(c)).toBe(true);
        }
    });

    it('every AUTO_EVIDENCE_RULES requirement code exists in its catalog', () => {
        // Index catalog codes by framework key.
        const byFramework = new Map<string, Set<string>>();
        for (const fileName of SCHEME_FILES) {
            const file = loadAndValidateCatalogFile(path.join(CATALOG_DIR, fileName));
            byFramework.set(file.framework.key, new Set(file.requirements.map((r) => r.code)));
        }

        for (const rules of Object.values(AUTO_EVIDENCE_RULES)) {
            for (const rule of rules ?? []) {
                const catalogCodes = byFramework.get(rule.frameworkKey);
                expect(catalogCodes).toBeDefined();
                for (const code of rule.requirementCodes) {
                    expect(catalogCodes!.has(code)).toBe(true);
                }
            }
        }
    });
});

describe('new illustrative scheme catalogs (LEAF Marque + Red Tractor)', () => {
    test.each(NEW_SCHEME_FILES)('%s is a sized, themed, illustrative AG_SCHEME', (fileName) => {
        const file = loadAndValidateCatalogFile(path.join(CATALOG_DIR, fileName));

        // ~8-15 requirements + matching templates, organized by theme.
        expect(file.framework.kind).toBe('AG_SCHEME');
        expect(file.requirements.length).toBeGreaterThanOrEqual(8);
        expect(file.requirements.length).toBeLessThanOrEqual(15);
        expect(file.templates.length).toBeGreaterThanOrEqual(1);

        // Demo version + license-hygiene marker on the framework.
        expect(file.framework.version).toBe('2024-demo');
        expect(file.framework.description ?? '').toMatch(/illustrative|concept-only|paraphrased|NOT the official/i);

        // A starter pack exists, referencing only this file's templates
        // (the loader's cross-validator would already have thrown otherwise).
        expect(file.pack).toBeDefined();
        expect((file.pack!.templateCodes ?? []).length).toBeGreaterThan(0);

        // Every requirement is themed (organized into sections).
        for (const r of file.requirements) {
            expect((r.theme ?? r.section ?? '').length).toBeGreaterThan(0);
        }
    });

    it('both new catalogs are registered in the importer SCHEME_CATALOGS list', () => {
        const importer = fs.readFileSync(
            path.resolve(__dirname, '..', '..', 'scripts', 'import-schemes.ts'),
            'utf8',
        );
        for (const fileName of NEW_SCHEME_FILES) {
            expect(importer).toContain(fileName);
        }
    });

    it('the LEAF Marque catalog defines its IFM theme codes', () => {
        const file = loadAndValidateCatalogFile(path.join(CATALOG_DIR, 'leaf-marque-demo.yaml'));
        expect(file.framework.key).toBe('LEAF-MARQUE-DEMO');
        const codes = new Set(file.requirements.map((r) => r.code));
        for (const c of ['LM.1.1', 'LM.2.1', 'LM.3.1']) {
            expect(codes.has(c)).toBe(true);
        }
    });

    it('the Red Tractor catalog defines its traceability + plant-protection codes', () => {
        const file = loadAndValidateCatalogFile(path.join(CATALOG_DIR, 'red-tractor-demo.yaml'));
        expect(file.framework.key).toBe('RED-TRACTOR-DEMO');
        const codes = new Set(file.requirements.map((r) => r.code));
        for (const c of ['RT.1.1', 'RT.2.1', 'RT.2.3']) {
            expect(codes.has(c)).toBe(true);
        }
    });

    it('rejects a scheme YAML whose template points at a missing requirement', () => {
        // Regression proof the cross-validator is wired — written to the
        // OS temp dir (not the catalog dir, which the importer scans).
        const os = require('os');
        const tmp = path.join(
            fs.mkdtempSync(path.join(os.tmpdir(), 'scheme-catalog-')),
            'bad.yaml',
        );
        fs.writeFileSync(
            tmp,
            [
                'framework: { key: BAD-DEMO, name: Bad demo, kind: AG_SCHEME }',
                'requirements:',
                '  - { code: X.1, title: A requirement }',
                'templates:',
                '  - code: T1',
                '    title: Template',
                '    category: C',
                '    requirementCodes: [X.999]',
                '',
            ].join('\n'),
            'utf8',
        );
        try {
            expect(() => loadAndValidateCatalogFile(tmp)).toThrow(CatalogValidationError);
        } finally {
            fs.rmSync(tmp, { force: true });
        }
    });
});
