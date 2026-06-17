/**
 * Dimensional-analysis guardrail for the unit-conversion layer.
 *
 * Spray dose math (and any future ag quantity math) deducts product from
 * a financial+regulatory ledger, so unit handling must be dimensionally
 * sound: conversions stay within a dimension, the catalog factors are
 * exact, and a RATE applied over an area yields the numerator unit. This
 * locks those invariants so a future edit can't silently let `kg→L`
 * succeed or break `L/ha × ha = L`.
 */
import {
    convert,
    applyRate,
    canConvert,
    isRateUnit,
    rateNumeratorUnit,
    dimensionOf,
    isKnownUnit,
    DimensionMismatchError,
    UnknownUnitError,
    type Dimension,
} from '@/lib/units/unit-conversion';

describe('unit conversion — dimensional analysis', () => {
    describe('exact intra-dimension conversions (no float drift)', () => {
        it('kg → g is exactly ×1000', () => {
            expect(convert(1, 'kg', 'g')).toBe(1000);
            expect(convert(2.5, 'kg', 'g')).toBe(2500);
            expect(convert(0.001, 'kg', 'g')).toBe(1);
        });
        it('t → kg → g chain is exact', () => {
            expect(convert(1, 't', 'kg')).toBe(1000);
            expect(convert(1, 't', 'g')).toBe(1_000_000);
        });
        it('L → mL is exactly ×1000', () => {
            expect(convert(1, 'l', 'ml')).toBe(1000);
            expect(convert(2.5, 'l', 'ml')).toBe(2500);
        });
        it('ha → m² is exactly ×10000', () => {
            expect(convert(1, 'ha', 'm2')).toBe(10_000);
            expect(convert(0.5, 'ha', 'm2')).toBe(5000);
        });
        it('identity conversion returns the input exactly', () => {
            expect(convert(42.1234, 'l', 'l')).toBe(42.1234);
        });
        it('round-trips within a dimension', () => {
            expect(convert(convert(7, 'l', 'ml'), 'ml', 'l')).toBeCloseTo(7, 10);
            expect(convert(convert(3.3, 'kg', 'g'), 'g', 'kg')).toBeCloseTo(3.3, 10);
        });
    });

    describe('cross-dimension is forbidden', () => {
        it('kg → L throws DimensionMismatchError (WEIGHT vs VOLUME)', () => {
            expect(() => convert(1, 'kg', 'l')).toThrow(DimensionMismatchError);
        });
        it('ha → L throws (AREA vs VOLUME)', () => {
            expect(() => convert(1, 'ha', 'l')).toThrow(DimensionMismatchError);
        });
        it('canConvert is false across dimensions, true within', () => {
            expect(canConvert('kg', 'l')).toBe(false);
            expect(canConvert('kg', 'g')).toBe(true);
            expect(canConvert('l', 'ml')).toBe(true);
            expect(canConvert('ha', 'm2')).toBe(true);
        });
    });

    describe('unknown units throw', () => {
        it('throws UnknownUnitError on an unregistered unit', () => {
            expect(() => convert(1, 'furlong', 'm')).toThrow(UnknownUnitError);
            expect(() => convert(1, 'kg', 'stone')).toThrow(UnknownUnitError);
        });
        it('canConvert is false for unknown units (never throws)', () => {
            expect(canConvert('furlong', 'm')).toBe(false);
            expect(isKnownUnit('furlong')).toBe(false);
            expect(isKnownUnit('kg')).toBe(true);
        });
    });

    describe('RATE application — L/ha × ha = L', () => {
        it('applies a rate over an area in hectares to the numerator unit', () => {
            const r = applyRate(2, 'l-per-ha', 3, 'ha');
            expect(r).toEqual({ value: 6, unitKey: 'l' });
        });
        it('converts the area into the rate denominator first (L/ha × m²)', () => {
            // 2 L/ha over 10000 m² (= 1 ha) = 2 L
            const r = applyRate(2, 'l-per-ha', 10_000, 'm2');
            expect(r.value).toBeCloseTo(2, 10);
            expect(r.unitKey).toBe('l');
        });
        it('kg/ha and g/ha resolve to their weight numerators', () => {
            expect(applyRate(5, 'kg-per-ha', 2, 'ha')).toEqual({ value: 10, unitKey: 'kg' });
            expect(applyRate(50, 'g-per-ha', 2, 'ha')).toEqual({ value: 100, unitKey: 'g' });
        });
        it('rejects a non-area unit as the "area" argument', () => {
            expect(() => applyRate(2, 'l-per-ha', 3, 'kg')).toThrow(DimensionMismatchError);
        });
        it('rejects an unknown rate unit', () => {
            expect(() => applyRate(2, 'gal-per-acre', 3, 'ha')).toThrow(UnknownUnitError);
        });
    });

    describe('catalog coherence', () => {
        const RATE_KEYS = ['l-per-ha', 'ml-per-ha', 'kg-per-ha', 'g-per-ha'];
        it('every rate unit resolves to a known scalar numerator + an AREA denominator', () => {
            for (const key of RATE_KEYS) {
                expect(isRateUnit(key)).toBe(true);
                const num = rateNumeratorUnit(key);
                expect(num).not.toBeNull();
                expect(isKnownUnit(num!)).toBe(true);
                // applying the rate over 1 ha must succeed and land in the numerator
                expect(applyRate(1, key, 1, 'ha').unitKey).toBe(num);
            }
        });
        it('dimensionOf classifies scalars and rates', () => {
            const cases: Array<[string, Dimension | 'RATE']> = [
                ['kg', 'WEIGHT'],
                ['l', 'VOLUME'],
                ['ha', 'AREA'],
                ['each', 'COUNT'],
                ['m', 'LENGTH'],
                ['l-per-ha', 'RATE'],
            ];
            for (const [key, dim] of cases) expect(dimensionOf(key)).toBe(dim);
            expect(dimensionOf('nope')).toBeNull();
        });
    });
});
