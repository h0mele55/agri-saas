/**
 * WP-2 — per-tenant module gating (pure helpers; no DB access).
 *
 * A module is "enabled" for a tenant when it appears in
 * `TenantModuleSettings.enabledModules`. A tenant with NO settings row
 * has ALL modules enabled (backward-compatible default) — a tenant opts
 * into "simple mode" by saving a restricted list. The DB-backed
 * resolution + the `assertModuleEnabled` gate live in
 * `src/app-layer/usecases/modules.ts`; enforcement coverage is locked by
 * `tests/guardrails/module-gate-coverage.test.ts`.
 */
import type { ModuleKey } from '@prisma/client';

export const ALL_MODULES: readonly ModuleKey[] = [
    'JOURNAL',
    'INVENTORY',
    'PLANNING',
    'CERTIFICATION',
    'RISK',
    'VENDORS',
    'AUTOMATION',
    'PROCESSES',
    'AI',
] as const;

export const MODULE_LABELS: Record<ModuleKey, string> = {
    JOURNAL: 'Farm Journal',
    INVENTORY: 'Inventory',
    PLANNING: 'Crop Planning',
    CERTIFICATION: 'Certification & Compliance',
    RISK: 'Risk Register',
    VENDORS: 'Suppliers & Buyers',
    AUTOMATION: 'Automation',
    PROCESSES: 'Process Maps',
    AI: 'AI Assist',
};

/** One-line "what this module does" copy for the settings page. */
export const MODULE_DESCRIPTIONS: Record<ModuleKey, string> = {
    JOURNAL: 'Field operations, spray jobs, and the parcel map.',
    INVENTORY: 'Input stock, lots, and stock-deduction on job completion.',
    PLANNING: 'Crop plans, rotations, and the season calendar.',
    CERTIFICATION: 'Audit frameworks, controls, evidence, and policies.',
    RISK: 'The farm risk register and treatment tracking.',
    VENDORS: 'Suppliers, buyers, and their assessments.',
    AUTOMATION: 'Rules that react to events and run actions.',
    PROCESSES: 'Process maps and standard operating procedures.',
    AI: 'AI-assisted drafting and suggestions across the product.',
};

/**
 * Ag-first default for a tenant with NO settings row: every module
 * EXCEPT CERTIFICATION. Phase-0 makes the agriculture surface the
 * chassis; the compliance/GRC surface stays gated off until a tenant
 * opts in (flips CERTIFICATION on). A saved row is used verbatim.
 */
export const DEFAULT_MODULES: readonly ModuleKey[] = ALL_MODULES.filter(
    (m) => m !== 'CERTIFICATION',
);

/**
 * Resolve a tenant's enabled modules from its settings row.
 * `null` row (a fresh tenant) → the ag-first {@link DEFAULT_MODULES}.
 */
export function resolveEnabledModules(row: { enabledModules: ModuleKey[] } | null | undefined): ModuleKey[] {
    if (!row) return [...DEFAULT_MODULES];
    return row.enabledModules;
}

export function isModuleEnabledIn(modules: readonly ModuleKey[], key: ModuleKey): boolean {
    return modules.includes(key);
}

/** Validate an arbitrary string[] down to known ModuleKey values. */
export function coerceModuleKeys(input: readonly string[]): ModuleKey[] {
    const set = new Set<string>(ALL_MODULES);
    return input.filter((m): m is ModuleKey => set.has(m));
}
