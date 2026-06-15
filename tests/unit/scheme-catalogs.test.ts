/**
 * Validity of the concept-only certification-scheme catalogs that
 * `scripts/import-schemes.ts` (`npm run schemes:import`) applies.
 *
 * Loads + cross-validates each YAML against `CatalogFileSchema` (no DB),
 * and asserts the cross-links the schema alone can't (the
 * AUTO_EVIDENCE_RULES requirement codes really exist in the catalogs, the
 * frameworks are AG_SCHEME, the text is marked illustrative).
 */
import * as path from 'path';
import { loadAndValidateCatalogFile } from '../../prisma/catalog-loader';
import { AUTO_EVIDENCE_RULES } from '@/app-layer/usecases/auto-evidence';

const CATALOG_DIR = path.resolve(__dirname, '..', '..', 'prisma', 'catalogs');
const SCHEME_FILES = ['globalgap-ifa-demo.yaml', 'eu-organic-2018-848-demo.yaml'];

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
