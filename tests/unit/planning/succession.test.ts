/**
 * Unit tests for the pure succession-planting engine
 * (`src/lib/planning/succession.ts`). No DB, no mocks — exhaustive
 * coverage of the date / plant-count / seed-quantity / allocation math.
 */
import {
    addUtcDays,
    mergeTiming,
    mergeSpacing,
    computeDates,
    computePlantCount,
    computeSeedGrams,
    generateSuccessions,
    type CropTiming,
    type CropSpacing,
} from '@/lib/planning/succession';

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe('addUtcDays', () => {
    it('adds whole days in UTC without timezone drift', () => {
        expect(iso(addUtcDays(new Date('2026-03-01T00:00:00Z'), 30))).toBe('2026-03-31');
    });
    it('handles month/year rollover and negatives', () => {
        expect(iso(addUtcDays(new Date('2026-12-20T00:00:00Z'), 15))).toBe('2027-01-04');
        expect(iso(addUtcDays(new Date('2026-03-01T00:00:00Z'), -1))).toBe('2026-02-28');
    });
    it('does not mutate its input', () => {
        const d = new Date('2026-03-01T00:00:00Z');
        addUtcDays(d, 10);
        expect(iso(d)).toBe('2026-03-01');
    });
});

describe('mergeTiming — variety overrides crop, field by field', () => {
    const crop: Partial<CropTiming> = {
        method: 'TRANSPLANT',
        daysToTransplant: 35,
        daysToMaturity: 60,
        harvestWindowDays: 14,
    };
    it('variety value wins when present', () => {
        const merged = mergeTiming(crop, { daysToMaturity: 75 });
        expect(merged.daysToMaturity).toBe(75);
        expect(merged.daysToTransplant).toBe(35); // falls back to crop
        expect(merged.method).toBe('TRANSPLANT');
    });
    it('crop value fills when variety field is null/undefined', () => {
        const merged = mergeTiming(crop, { daysToTransplant: null, harvestWindowDays: undefined });
        expect(merged.daysToTransplant).toBe(35);
        expect(merged.harvestWindowDays).toBe(14);
    });
    it('defaults method to DIRECT_SOW and maturity to 0 when neither set', () => {
        const merged = mergeTiming(null, null);
        expect(merged.method).toBe('DIRECT_SOW');
        expect(merged.daysToMaturity).toBe(0);
    });
});

describe('mergeSpacing', () => {
    it('variety overrides crop per field, nulls fall through', () => {
        const merged = mergeSpacing(
            { inRowSpacingCm: 30, betweenRowSpacingCm: 45, seedsPerGram: 300 },
            { inRowSpacingCm: 25, seedsPerGram: null },
        );
        expect(merged.inRowSpacingCm).toBe(25); // variety wins
        expect(merged.betweenRowSpacingCm).toBe(45); // crop fills
        expect(merged.seedsPerGram).toBe(300); // null → crop fills
    });
});

describe('computeDates', () => {
    it('TRANSPLANT: transplant = sow + daysToTransplant; harvest from transplant', () => {
        const timing: CropTiming = {
            method: 'TRANSPLANT',
            daysToTransplant: 35,
            daysToMaturity: 60,
            harvestWindowDays: 14,
        };
        const d = computeDates(new Date('2026-03-01T00:00:00Z'), timing);
        expect(iso(d.sowDate)).toBe('2026-03-01');
        expect(iso(d.transplantDate)).toBe('2026-04-05'); // +35
        expect(iso(d.harvestStartDate)).toBe('2026-06-04'); // +60 from transplant
        expect(iso(d.harvestEndDate)).toBe('2026-06-18'); // +14 window
    });
    it('DIRECT_SOW: no transplant; harvest measured from sow', () => {
        const timing: CropTiming = {
            method: 'DIRECT_SOW',
            daysToMaturity: 50,
            harvestWindowDays: 0,
        };
        const d = computeDates(new Date('2026-04-01T00:00:00Z'), timing);
        expect(d.transplantDate).toBeNull();
        expect(iso(d.harvestStartDate)).toBe('2026-05-21'); // +50 from sow
        expect(iso(d.harvestEndDate)).toBe('2026-05-21'); // window 0 ⇒ single day
    });
    it('null harvestWindowDays treated as single-day pick', () => {
        const d = computeDates(new Date('2026-04-01T00:00:00Z'), {
            method: 'DIRECT_SOW',
            daysToMaturity: 30,
            harvestWindowDays: null,
        });
        expect(iso(d.harvestEndDate)).toBe(iso(d.harvestStartDate));
    });
});

describe('computePlantCount', () => {
    const spacing: CropSpacing = { inRowSpacingCm: 30, betweenRowSpacingCm: 50 };

    it('priority 1 — explicit plantsPerSuccession, footprint from spacing', () => {
        const r = computePlantCount({ plantsPerSuccession: 100 }, spacing);
        expect(r.plantCount).toBe(100);
        // 100 * 0.30m * 0.50m = 15 m²
        expect(r.areaM2).toBe(15);
    });
    it('priority 2 — bed geometry: floor(bedLen*100/inRow) * rows', () => {
        // 10 m bed / 0.30 m = 33 per row; × 3 rows = 99
        const r = computePlantCount({ bedLengthM: 10, rowsPerBed: 3 }, spacing);
        expect(r.plantCount).toBe(99);
    });
    it('priority 2 — bed defaults to 1 row when rowsPerBed missing', () => {
        const r = computePlantCount({ bedLengthM: 10 }, spacing);
        expect(r.plantCount).toBe(33);
    });
    it('priority 3 — area: floor(area / (inRow*betweenRow))', () => {
        // 15 m² / (0.30*0.50=0.15) = 100
        const r = computePlantCount({ areaM2: 15 }, spacing);
        expect(r.plantCount).toBe(100);
        expect(r.areaM2).toBe(15);
    });
    it('returns null count when no strategy has enough data', () => {
        expect(computePlantCount({}, {}).plantCount).toBeNull();
        // area given but no spacing → cannot count, area preserved
        const r = computePlantCount({ areaM2: 20 }, {});
        expect(r.plantCount).toBeNull();
        expect(r.areaM2).toBe(20);
    });
    it('explicit count without full spacing → no footprint', () => {
        expect(computePlantCount({ plantsPerSuccession: 50 }, { inRowSpacingCm: 30 }).areaM2).toBeNull();
    });
});

describe('computeSeedGrams', () => {
    it('seeds = count × seedsPerCell ÷ germ; grams = seeds ÷ seedsPerGram', () => {
        // 100 plants, 1 seed/cell, germ 0.8 → 125 seeds; /250 seeds/g = 0.5 g
        const g = computeSeedGrams(100, { seedsPerGram: 250, germinationRate: 0.8, seedsPerCell: 1 });
        expect(g).toBe(0.5);
    });
    it('defaults germination to 1 and seedsPerCell to 1', () => {
        // 300 seeds / 300 per g = 1 g
        expect(computeSeedGrams(300, { seedsPerGram: 300 })).toBe(1);
    });
    it('multi-seed cells multiply the seed count', () => {
        // 100 cells × 3 seeds = 300 seeds / 300 = 1 g
        expect(computeSeedGrams(100, { seedsPerGram: 300, seedsPerCell: 3 })).toBe(1);
    });
    it('null when seedsPerGram missing or count <= 0', () => {
        expect(computeSeedGrams(100, {})).toBeNull();
        expect(computeSeedGrams(0, { seedsPerGram: 250 })).toBeNull();
        expect(computeSeedGrams(null, { seedsPerGram: 250 })).toBeNull();
    });
    it('ignores an out-of-range germination rate (>1) — treats as 1', () => {
        expect(computeSeedGrams(300, { seedsPerGram: 300, germinationRate: 1.5 })).toBe(1);
    });
});

describe('generateSuccessions', () => {
    const timing: CropTiming = {
        method: 'TRANSPLANT',
        daysToTransplant: 35,
        daysToMaturity: 60,
        harvestWindowDays: 14,
    };
    const spacing: CropSpacing = { inRowSpacingCm: 30, betweenRowSpacingCm: 50, seedsPerGram: 250, germinationRate: 0.8 };

    it('produces N plantings spaced by intervalDays, 1-based', () => {
        const out = generateSuccessions(
            { firstSowDate: new Date('2026-03-01T00:00:00Z'), successions: 4, intervalDays: 14 },
            timing,
            { plantsPerSuccession: 100 },
            spacing,
        );
        expect(out).toHaveLength(4);
        expect(out.map((p) => p.successionNumber)).toEqual([1, 2, 3, 4]);
        expect(out.map((p) => iso(p.sowDate))).toEqual([
            '2026-03-01', '2026-03-15', '2026-03-29', '2026-04-12',
        ]);
        // dates cascade per succession
        expect(iso(out[1].transplantDate)).toBe('2026-04-19'); // 03-15 + 35
        expect(iso(out[1].harvestStartDate)).toBe('2026-06-18'); // +60
        // count + seed grams identical across successions
        expect(out[0].plantCount).toBe(100);
        expect(out[0].seedQuantityGrams).toBe(0.5); // 100/0.8=125 seeds /250 = 0.5g
    });

    it('clamps successions to >= 1 and interval to >= 0', () => {
        const out = generateSuccessions(
            { firstSowDate: new Date('2026-03-01T00:00:00Z'), successions: 0, intervalDays: -5 },
            timing,
            {},
            {},
        );
        expect(out).toHaveLength(1);
        expect(iso(out[0].sowDate)).toBe('2026-03-01');
    });

    it('direct-sow single succession with no allocation → null count/seed', () => {
        const out = generateSuccessions(
            { firstSowDate: new Date('2026-05-01T00:00:00Z'), successions: 1, intervalDays: 0 },
            { method: 'DIRECT_SOW', daysToMaturity: 45, harvestWindowDays: 7 },
            {},
            {},
        );
        expect(out[0].transplantDate).toBeNull();
        expect(out[0].plantCount).toBeNull();
        expect(out[0].seedQuantityGrams).toBeNull();
        expect(iso(out[0].harvestStartDate)).toBe('2026-06-15');
    });
});
