/**
 * Succession-planting engine — PURE date / seed-quantity / allocation math.
 *
 * Clean-room reimplementation of standard market-garden succession
 * planning (the problem space Qrop / CropPlanning solve). The formulas
 * below are derived from first-principles agronomy — evenly-spaced
 * sowings, transplant vs direct-sow offsets, bed-geometry plant counts,
 * germination-overage seed quantities — NOT transcribed from any GPL
 * source. No DB, no I/O, no Prisma types: every function is total and
 * deterministic so the whole engine is exhaustively unit-tested.
 *
 * The usecase layer maps Prisma rows (CropType/CropVariety/CropPlan)
 * onto these plain inputs and persists the `ComputedPlanting[]` as
 * `Planting` rows. Date math is UTC-only (`addUtcDays`) so a server in
 * any timezone computes identical calendar dates.
 */

// ─── Inputs ──────────────────────────────────────────────────────────

export type PlantingMethod = 'DIRECT_SOW' | 'TRANSPLANT';

/**
 * Agronomic timing for a crop/variety, already MERGED (variety values
 * override crop-type defaults field-by-field via `mergeTiming`). Days are
 * whole-day integers.
 */
export interface CropTiming {
    method: PlantingMethod;
    /** Sow → transplant, in days. Required for TRANSPLANT; ignored for
     *  DIRECT_SOW. */
    daysToTransplant?: number | null;
    /** Days to first harvest, measured from the TRANSPLANT date for a
     *  transplanted crop, or from the SOW date for a direct-sown crop. */
    daysToMaturity: number;
    /** Length of the harvest window in days (single-pick crops = 0). */
    harvestWindowDays?: number | null;
}

/** Spacing + seed parameters driving plant-count and seed-quantity. */
export interface CropSpacing {
    /** In-row plant spacing (cm). */
    inRowSpacingCm?: number | null;
    /** Between-row spacing (cm) — used for area-based counts. */
    betweenRowSpacingCm?: number | null;
    /** Seeds per gram (variety seed size) — for grams from seed count. */
    seedsPerGram?: number | null;
    /** Expected germination, 0..1 (defaults to 1 = no overage). */
    germinationRate?: number | null;
    /** Seeds sown per transplant cell (defaults to 1). DIRECT_SOW uses 1
     *  seed per station. */
    seedsPerCell?: number | null;
}

/** How many successions and how far apart. */
export interface SuccessionConfig {
    firstSowDate: Date;
    /** Number of succession plantings (>= 1). */
    successions: number;
    /** Calendar days between consecutive sowings (>= 0). */
    intervalDays: number;
}

/**
 * Drives the per-succession plant count. Resolved in priority order:
 *   1. explicit `plantsPerSuccession`
 *   2. bed geometry (`bedLengthM` * `rowsPerBed` / inRowSpacing)
 *   3. area (`areaM2` / (inRow * betweenRow))
 * The first option with enough data wins; otherwise plant count is null.
 */
export interface AllocationConfig {
    plantsPerSuccession?: number | null;
    bedLengthM?: number | null;
    rowsPerBed?: number | null;
    areaM2?: number | null;
}

// ─── Output ──────────────────────────────────────────────────────────

export interface ComputedPlanting {
    /** 1-based succession index. */
    successionNumber: number;
    sowDate: Date;
    /** Null for DIRECT_SOW. */
    transplantDate: Date | null;
    harvestStartDate: Date;
    harvestEndDate: Date;
    /** Null when allocation data is insufficient. */
    plantCount: number | null;
    /** Null when seed parameters are insufficient. */
    seedQuantityGrams: number | null;
    /** Footprint in m² when derivable (bed or area allocation). */
    areaM2: number | null;
}

// ─── Date helpers (UTC, calendar-day exact) ──────────────────────────

/** Add whole calendar days to a Date in UTC (no DST / timezone drift). */
export function addUtcDays(date: Date, days: number): Date {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + Math.trunc(days));
    return d;
}

// ─── Default merge ───────────────────────────────────────────────────

/**
 * Merge crop-type defaults with variety overrides — variety wins on any
 * field it provides (non-null/undefined). The variety's method overrides
 * the crop's; `daysToMaturity` falls back to the crop default and finally
 * to 0 (caller should validate it is set for a real plan).
 */
export function mergeTiming(
    crop: Partial<CropTiming> | null | undefined,
    variety: Partial<CropTiming> | null | undefined,
): CropTiming {
    const pick = <K extends keyof CropTiming>(k: K): CropTiming[K] | undefined => {
        const v = variety?.[k];
        if (v !== undefined && v !== null) return v;
        const c = crop?.[k];
        if (c !== undefined && c !== null) return c;
        return undefined;
    };
    return {
        method: (pick('method') as PlantingMethod) ?? 'DIRECT_SOW',
        daysToTransplant: pick('daysToTransplant') ?? null,
        daysToMaturity: (pick('daysToMaturity') as number) ?? 0,
        harvestWindowDays: pick('harvestWindowDays') ?? null,
    };
}

export function mergeSpacing(
    crop: Partial<CropSpacing> | null | undefined,
    variety: Partial<CropSpacing> | null | undefined,
): CropSpacing {
    const pick = <K extends keyof CropSpacing>(k: K): CropSpacing[K] | null => {
        const v = variety?.[k];
        if (v !== undefined && v !== null) return v;
        const c = crop?.[k];
        if (c !== undefined && c !== null) return c;
        return null;
    };
    return {
        inRowSpacingCm: pick('inRowSpacingCm'),
        betweenRowSpacingCm: pick('betweenRowSpacingCm'),
        seedsPerGram: pick('seedsPerGram'),
        germinationRate: pick('germinationRate'),
        seedsPerCell: pick('seedsPerCell'),
    };
}

// ─── Date computation for one sowing ─────────────────────────────────

export interface PlantingDates {
    sowDate: Date;
    transplantDate: Date | null;
    harvestStartDate: Date;
    harvestEndDate: Date;
}

/**
 * Compute the lifecycle dates for a single sowing.
 *   TRANSPLANT: transplant = sow + daysToTransplant; harvest = transplant + daysToMaturity.
 *   DIRECT_SOW: transplant = null;                   harvest = sow + daysToMaturity.
 * harvestEnd = harvestStart + harvestWindowDays (0 ⇒ single-day pick).
 */
export function computeDates(sowDate: Date, timing: CropTiming): PlantingDates {
    const isTransplant = timing.method === 'TRANSPLANT';
    const transplantDate = isTransplant
        ? addUtcDays(sowDate, timing.daysToTransplant ?? 0)
        : null;
    const maturityAnchor = transplantDate ?? sowDate;
    const harvestStartDate = addUtcDays(maturityAnchor, timing.daysToMaturity);
    const harvestEndDate = addUtcDays(harvestStartDate, timing.harvestWindowDays ?? 0);
    return { sowDate, transplantDate, harvestStartDate, harvestEndDate };
}

// ─── Plant-count + seed-quantity ─────────────────────────────────────

/**
 * Resolve the per-succession plant count + its footprint (m²).
 * Priority: explicit count → bed geometry → area. Returns nulls when the
 * inputs for every strategy are insufficient.
 */
export function computePlantCount(
    alloc: AllocationConfig,
    spacing: CropSpacing,
): { plantCount: number | null; areaM2: number | null } {
    const inRowCm = spacing.inRowSpacingCm ?? null;
    const betweenCm = spacing.betweenRowSpacingCm ?? null;

    // 1 — explicit count. Footprint derivable only if we have full spacing.
    if (alloc.plantsPerSuccession != null && alloc.plantsPerSuccession > 0) {
        const count = Math.round(alloc.plantsPerSuccession);
        let areaM2: number | null = null;
        if (inRowCm && betweenCm) {
            areaM2 = round2((count * (inRowCm / 100) * (betweenCm / 100)));
        }
        return { plantCount: count, areaM2 };
    }

    // 2 — bed geometry: plants per row = bedLength / inRowSpacing; × rows.
    if (alloc.bedLengthM != null && alloc.bedLengthM > 0 && inRowCm) {
        const rows = alloc.rowsPerBed != null && alloc.rowsPerBed > 0 ? Math.round(alloc.rowsPerBed) : 1;
        const perRow = Math.floor((alloc.bedLengthM * 100) / inRowCm);
        const count = perRow * rows;
        let areaM2: number | null = null;
        if (betweenCm) {
            // Bed footprint ≈ bedLength × (rows × betweenRowSpacing).
            areaM2 = round2(alloc.bedLengthM * ((rows * betweenCm) / 100));
        }
        return { plantCount: count > 0 ? count : null, areaM2 };
    }

    // 3 — area: count = area / (inRow × betweenRow) in m².
    if (alloc.areaM2 != null && alloc.areaM2 > 0 && inRowCm && betweenCm) {
        const perPlantM2 = (inRowCm / 100) * (betweenCm / 100);
        const count = Math.floor(alloc.areaM2 / perPlantM2);
        return { plantCount: count > 0 ? count : null, areaM2: round2(alloc.areaM2) };
    }

    return { plantCount: null, areaM2: alloc.areaM2 ?? null };
}

/**
 * Grams of seed for a plant count, with germination overage.
 *   seeds = plantCount × seedsPerCell ÷ germinationRate
 *   grams = seeds ÷ seedsPerGram
 * Returns null when seedsPerGram is unknown (can't convert to mass).
 */
export function computeSeedGrams(
    plantCount: number | null,
    spacing: CropSpacing,
): number | null {
    if (plantCount == null || plantCount <= 0) return null;
    if (!spacing.seedsPerGram || spacing.seedsPerGram <= 0) return null;
    const seedsPerCell = spacing.seedsPerCell && spacing.seedsPerCell > 0 ? spacing.seedsPerCell : 1;
    const germ = spacing.germinationRate && spacing.germinationRate > 0 && spacing.germinationRate <= 1
        ? spacing.germinationRate
        : 1;
    const seeds = (plantCount * seedsPerCell) / germ;
    return round2(seeds / spacing.seedsPerGram);
}

// ─── Main entry ──────────────────────────────────────────────────────

/**
 * Generate the full succession schedule. For each succession i (0-based):
 *   sowDate_i = firstSowDate + i × intervalDays
 * then the lifecycle dates + plant count + seed grams are computed from
 * the merged timing/spacing. `successions` is clamped to >= 1.
 */
export function generateSuccessions(
    config: SuccessionConfig,
    timing: CropTiming,
    alloc: AllocationConfig,
    spacing: CropSpacing,
): ComputedPlanting[] {
    const n = Math.max(1, Math.trunc(config.successions || 1));
    const interval = Math.max(0, Math.trunc(config.intervalDays || 0));
    const { plantCount, areaM2 } = computePlantCount(alloc, spacing);
    const seedQuantityGrams = computeSeedGrams(plantCount, spacing);

    const out: ComputedPlanting[] = [];
    for (let i = 0; i < n; i++) {
        const sowDate = addUtcDays(config.firstSowDate, i * interval);
        const dates = computeDates(sowDate, timing);
        out.push({
            successionNumber: i + 1,
            sowDate: dates.sowDate,
            transplantDate: dates.transplantDate,
            harvestStartDate: dates.harvestStartDate,
            harvestEndDate: dates.harvestEndDate,
            plantCount,
            seedQuantityGrams,
            areaM2,
        });
    }
    return out;
}

// ─── internal ────────────────────────────────────────────────────────

/** Round to 2 decimals (seed grams / m² don't need more precision). */
function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
