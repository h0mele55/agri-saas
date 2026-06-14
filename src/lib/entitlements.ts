/**
 * Plan Entitlements
 *
 * Single source of truth for which features are available on each billing plan.
 * Used by both server-side gates (API routes) and client-side UI (UpgradeGate component).
 *
 * ─── Feature-to-Plan Mapping ───
 *
 * | Feature                  | FREE | TRIAL | PRO | ENTERPRISE |
 * |--------------------------|------|-------|-----|------------|
 * | PDF_EXPORTS              | ✗    | ✓     | ✓   | ✓          |
 * | AUDIT_PACK_SHARING       | ✗    | ✗     | ✓   | ✓          |
 * | ADVANCED_VENDOR_MGMT     | ✗    | ✗     | ✓   | ✓          |
 * | CUSTOM_INTEGRATIONS      | ✗    | ✗     | ✗   | ✓          |
 */
/** Billing plan enum — mirrors Prisma BillingPlan but defined locally to avoid generated-client import issues. */
type BillingPlan = 'FREE' | 'TRIAL' | 'PRO' | 'ENTERPRISE';

// ─── Feature Keys ───

export const FEATURES = {
    PDF_EXPORTS: 'PDF_EXPORTS',
    AUDIT_PACK_SHARING: 'AUDIT_PACK_SHARING',
    ADVANCED_VENDOR_MGMT: 'ADVANCED_VENDOR_MGMT',
    CUSTOM_INTEGRATIONS: 'CUSTOM_INTEGRATIONS',
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

// ─── Plan hierarchy for comparisons ───

const PLAN_LEVEL: Record<BillingPlan, number> = {
    FREE: 0,
    TRIAL: 1,
    PRO: 2,
    ENTERPRISE: 3,
};

// ─── Feature → minimum plan required ───

const FEATURE_MIN_PLAN: Record<FeatureKey, BillingPlan> = {
    PDF_EXPORTS: 'TRIAL',
    AUDIT_PACK_SHARING: 'PRO',
    ADVANCED_VENDOR_MGMT: 'PRO',
    CUSTOM_INTEGRATIONS: 'ENTERPRISE',
};

// ─── Feature labels for UI ───

export const FEATURE_LABELS: Record<FeatureKey, string> = {
    PDF_EXPORTS: 'PDF Exports',
    AUDIT_PACK_SHARING: 'Audit Pack Sharing',
    ADVANCED_VENDOR_MGMT: 'Advanced Vendor Management',
    CUSTOM_INTEGRATIONS: 'Custom Integrations',
};

// ─── Core check ───

/**
 * Check if a plan includes a given feature.
 * Pure function — no DB access.
 */
export function hasFeature(plan: BillingPlan | string, feature: FeatureKey): boolean {
    const currentLevel = PLAN_LEVEL[plan as BillingPlan] ?? 0;
    const requiredPlan = FEATURE_MIN_PLAN[feature];
    const requiredLevel = PLAN_LEVEL[requiredPlan] ?? 0;
    return currentLevel >= requiredLevel;
}

/**
 * Get the minimum plan required for a feature.
 */
export function getRequiredPlan(feature: FeatureKey): BillingPlan {
    return FEATURE_MIN_PLAN[feature];
}

/**
 * Get all features available on a plan.
 */
export function getAvailableFeatures(plan: BillingPlan | string): FeatureKey[] {
    return (Object.keys(FEATURE_MIN_PLAN) as FeatureKey[]).filter(f => hasFeature(plan, f));
}


// ─── Module ↔ Plan (WP-2 / Phase-0 module gating) ───────────────────
//
// A module is *available* to a tenant when (the plan allows it) AND (the
// tenant has it enabled — `TenantModuleSettings`, resolved server-side).
// This file owns the PLAN half. When billing is unconfigured (self-hosted
// / dev → plan `null`) every module is plan-allowed, so the tenant flag is
// the only gate. The market-segmentation intent: smallholders ("simple
// mode") get the ag core; the heavier GRC + analytics surfaces are
// higher-tier.
import type { ModuleKey } from '@prisma/client';

const MODULE_MIN_PLAN: Record<ModuleKey, BillingPlan> = {
    JOURNAL: 'FREE',
    INVENTORY: 'FREE',
    PLANNING: 'TRIAL',
    CERTIFICATION: 'PRO',
    RISK: 'TRIAL',
    VENDORS: 'PRO',
    AUTOMATION: 'PRO',
    PROCESSES: 'PRO',
    AI: 'ENTERPRISE',
};

/** Does `plan` permit `key`? `null` plan (billing unconfigured) → yes. */
export function planAllowsModule(plan: BillingPlan | string | null, key: ModuleKey): boolean {
    if (plan == null) return true;
    const current = PLAN_LEVEL[plan as BillingPlan] ?? 0;
    const required = PLAN_LEVEL[MODULE_MIN_PLAN[key]] ?? 0;
    return current >= required;
}

/** All modules `plan` permits. `null` plan → every module. */
export function planModules(plan: BillingPlan | string | null): ModuleKey[] {
    return (Object.keys(MODULE_MIN_PLAN) as ModuleKey[]).filter((k) => planAllowsModule(plan, k));
}
