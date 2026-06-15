/**
 * `npm run schemes:import` — apply the concept-only certification-scheme
 * catalogs (GlobalG.A.P. IFA + EU Organic demos) into the global catalog
 * tables.
 *
 * A certification scheme is a GLOBAL `Framework` (kind = 'AG_SCHEME') plus
 * its `FrameworkRequirement` rows; this script loops the two catalog YAML
 * files under `prisma/catalogs/`, runs the same
 * `loadAndValidateCatalogFile` + `applyCatalogFile` pipeline the
 * `framework:import` CLI uses, and prints a per-file summary. Idempotent —
 * safe to re-run (the applier upserts on `key` / `key_version`).
 *
 * ## Usage
 *
 *   npm run schemes:import
 *   npx tsx scripts/import-schemes.ts
 *
 * ## Exit codes
 *
 *   0 — every catalog applied (or validated) successfully
 *   1 — runtime / DB error, OR a catalog parse/validation failure
 *
 * The two scheme catalogs are concept-only and license-clean: every
 * requirement title is paraphrased generic wording, marked illustrative
 * in each file's `framework.description`.
 */
process.env.SKIP_ENV_VALIDATION = '1';

import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
    loadAndValidateCatalogFile,
    CatalogParseError,
    CatalogValidationError,
} from '../prisma/catalog-loader';
import { applyCatalogFile } from '../prisma/catalog-applier';

/** Catalog files (resolved under prisma/catalogs/) applied in order. */
const SCHEME_CATALOGS = [
    'globalgap-ifa-demo.yaml',
    'eu-organic-2018-848-demo.yaml',
];

const CATALOG_DIR = path.resolve(__dirname, '..', 'prisma', 'catalogs');

async function main(): Promise<number> {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' });
    const prisma = new PrismaClient({ adapter });

    let failures = 0;
    try {
        for (const fileName of SCHEME_CATALOGS) {
            const inputPath = path.join(CATALOG_DIR, fileName);

            // Parse + cross-validate before any DB write — a bad file is
            // rejected at the boundary, not half-applied.
            let file;
            try {
                file = loadAndValidateCatalogFile(inputPath);
            } catch (err) {
                if (err instanceof CatalogParseError || err instanceof CatalogValidationError) {
                    process.stderr.write(`✗ ${fileName}: ${err.message}\n`);
                    failures++;
                    continue;
                }
                throw err;
            }

            try {
                const result = await applyCatalogFile(prisma, file, inputPath);
                process.stdout.write(
                    `✓ ${fileName} → ${result.framework.key} (${result.framework.created ? 'created' : 'updated'}): ` +
                        `${result.requirements.upserted} requirements, ` +
                        `${result.templates.created} new templates (${result.templates.existing} existing)` +
                        (result.pack
                            ? `, pack ${result.pack.key} (${result.pack.templatesLinked} templates linked)`
                            : '') +
                        `\n`,
                );
            } catch (err) {
                process.stderr.write(
                    `✗ ${fileName}: apply failed: ${err instanceof Error ? err.message : String(err)}\n`,
                );
                failures++;
            }
        }
    } finally {
        await prisma.$disconnect();
    }

    if (failures > 0) {
        process.stderr.write(`\n${failures} catalog(s) failed.\n`);
        return 1;
    }
    process.stdout.write(`\nAll ${SCHEME_CATALOGS.length} scheme catalogs applied.\n`);
    return 0;
}

main()
    .then((code) => process.exit(code))
    .catch((err) => {
        process.stderr.write(
            `Unexpected error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
        );
        process.exit(1);
    });
