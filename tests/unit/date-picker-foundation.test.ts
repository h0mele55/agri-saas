/**
 * Epic 58 — date-picker foundation tests.
 *
 * Locks the invariants the platform builds on:
 *
 *   - `toYMD` / `parseYMD` round-trip losslessly for any UTC day.
 *   - Serialisation is *timezone-insensitive* — the same Date
 *     produces the same `YYYY-MM-DD` regardless of the host TZ.
 *   - Range helpers normalise inverted ranges, handle nulls, and
 *     use UTC-day precision.
 *   - The default preset catalogue returns deterministic ranges for
 *     a frozen "now", and every preset produces a `from <= to`
 *     inclusive interval.
 *   - Preset materialisation bridges the resolvable → legacy shape
 *     cleanly.
 */

// Import from the foundation files directly rather than the barrel —
// the barrel re-exports the vendored calendar/trigger/picker UI
// which pulls JSX modules the node Jest project can't transform.
// The foundation is deliberately a JSX-free layer so these pure
// utility tests run in <100 ms under plain ts-jest.
import {
    addUtcDays,
    fromDateRangeValue,
    isDateInRange,
    isRangeEqual,
    isSameUtcDay,
    isValidDate,
    materializeDateRangePreset,
    normalizeRange,
    parseRangeToken,
    parseYMD,
    startOfUtcDay,
    toDateRangeValue,
    toRangeToken,
    toYMD,
} from '@/components/ui/date-picker/date-utils';
import {
    DEFAULT_DATE_RANGE_PRESETS,
    resolveLastMonth,
    resolveLastNDays,
    resolveLastQuarter,
    resolveLastYear,
    resolveMonthToDate,
    resolveQuarterToDate,
    resolveToday,
    resolveYearToDate,
    resolveYesterday,
    selectDateRangePresets,
} from '@/components/ui/date-picker/presets-catalogue';

// Fixed `now` used by preset tests — a Wednesday, 2026-04-15 (Q2).
const NOW = new Date(Date.UTC(2026, 3, 15, 12, 34, 56));

describe('date-picker foundation — type guards', () => {
    it('isValidDate rejects null / NaN / strings', () => {
        expect(isValidDate(null)).toBe(false);
        expect(isValidDate(undefined)).toBe(false);
        expect(isValidDate('2026-01-01')).toBe(false);
        expect(isValidDate(new Date('not-a-date'))).toBe(false);
    });

    it('isValidDate accepts a real Date', () => {
        expect(isValidDate(new Date())).toBe(true);
    });
});

describe('date-picker foundation — YMD serialisation', () => {
    it('toYMD reads UTC fields', () => {
        const d = new Date(Date.UTC(2026, 0, 1, 0, 0, 0));
        expect(toYMD(d)).toBe('2026-01-01');
    });

    it('toYMD pads single-digit month and day', () => {
        expect(toYMD(new Date(Date.UTC(2026, 2, 3)))).toBe('2026-03-03');
    });

    it('toYMD is null for nullish or invalid input', () => {
        expect(toYMD(null)).toBeNull();
        expect(toYMD(undefined)).toBeNull();
        expect(toYMD(new Date('not-a-date'))).toBeNull();
    });

    it('parseYMD returns a UTC-midnight Date', () => {
        const d = parseYMD('2026-04-21');
        expect(d).not.toBeNull();
        expect(d!.getUTCFullYear()).toBe(2026);
        expect(d!.getUTCMonth()).toBe(3);
        expect(d!.getUTCDate()).toBe(21);
        expect(d!.getUTCHours()).toBe(0);
    });

    it('parseYMD rejects malformed input', () => {
        expect(parseYMD('')).toBeNull();
        expect(parseYMD('2026')).toBeNull();
        expect(parseYMD('2026/04/21')).toBeNull();
        expect(parseYMD('2026-13-01')).toBeNull();
        expect(parseYMD('2026-02-30')).toBeNull(); // Feb 30 silently rolled
    });

    it('toYMD ∘ parseYMD is the identity for any valid day', () => {
        const sample = [
            '2020-02-29', // leap year
            '2021-02-28',
            '2025-12-31',
            '2026-04-21',
            '2030-07-04',
            '2100-01-01',
        ];
        for (const ymd of sample) {
            const parsed = parseYMD(ymd);
            expect(parsed).not.toBeNull();
            expect(toYMD(parsed!)).toBe(ymd);
        }
    });
});

describe('date-picker foundation — UTC-anchored day ops', () => {
    it('startOfUtcDay truncates hours/minutes/seconds', () => {
        const d = new Date(Date.UTC(2026, 3, 15, 18, 30, 45, 123));
        const s = startOfUtcDay(d);
        expect(s.getUTCHours()).toBe(0);
        expect(s.getUTCMinutes()).toBe(0);
        expect(s.getUTCMilliseconds()).toBe(0);
        expect(s.getUTCDate()).toBe(15);
    });

    it('isSameUtcDay uses UTC day, not local', () => {
        const morning = new Date(Date.UTC(2026, 3, 15, 0, 0, 0));
        const evening = new Date(Date.UTC(2026, 3, 15, 23, 59, 59));
        const next = new Date(Date.UTC(2026, 3, 16, 0, 0, 0));
        expect(isSameUtcDay(morning, evening)).toBe(true);
        expect(isSameUtcDay(evening, next)).toBe(false);
    });

    it('addUtcDays crosses month boundaries cleanly', () => {
        const d = new Date(Date.UTC(2026, 0, 31));
        const next = addUtcDays(d, 1);
        expect(next.getUTCMonth()).toBe(1);
        expect(next.getUTCDate()).toBe(1);
    });

    it('addUtcDays is DST-proof (adding 1 never rolls back an hour)', () => {
        // The first Sunday of April on a Windows-defaulted locale
        // would round-trip via a DST shift with naive `+86400e3` arithmetic.
        const d = new Date(Date.UTC(2026, 2, 8, 0, 0, 0)); // 8 Mar 2026
        const next = addUtcDays(d, 1);
        expect(next.getUTCDate()).toBe(9);
        expect(next.getUTCHours()).toBe(0);
    });
});

describe('date-picker foundation — range helpers', () => {
    const d1 = parseYMD('2026-04-10')!;
    const d2 = parseYMD('2026-04-20')!;

    it('normalizeRange swaps inverted ranges', () => {
        expect(normalizeRange({ from: d2, to: d1 })).toEqual({
            from: d1,
            to: d2,
        });
    });

    it('normalizeRange passes through a correctly ordered range', () => {
        expect(normalizeRange({ from: d1, to: d2 })).toEqual({
            from: d1,
            to: d2,
        });
    });

    it('normalizeRange leaves half-open ranges alone', () => {
        expect(normalizeRange({ from: d1, to: null })).toEqual({
            from: d1,
            to: null,
        });
        expect(normalizeRange({ from: null, to: d2 })).toEqual({
            from: null,
            to: d2,
        });
    });

    it('isDateInRange includes both endpoints', () => {
        const r = { from: d1, to: d2 };
        expect(isDateInRange(d1, r)).toBe(true);
        expect(isDateInRange(d2, r)).toBe(true);
    });

    it('isDateInRange rejects dates outside either bound', () => {
        const r = { from: d1, to: d2 };
        expect(isDateInRange(parseYMD('2026-04-09'), r)).toBe(false);
        expect(isDateInRange(parseYMD('2026-04-21'), r)).toBe(false);
    });

    it('isDateInRange handles half-open ranges', () => {
        expect(isDateInRange(parseYMD('2030-01-01'), { from: d1, to: null })).toBe(
            true,
        );
        expect(isDateInRange(parseYMD('1999-01-01'), { from: d1, to: null })).toBe(
            false,
        );
    });

    it('isRangeEqual compares UTC days only, null-tolerant', () => {
        // Mid-day variants fall on the same UTC day.
        const mid = new Date(Date.UTC(2026, 3, 10, 18, 30));
        expect(isRangeEqual({ from: d1, to: d2 }, { from: mid, to: d2 })).toBe(
            true,
        );
        // Different day.
        expect(
            isRangeEqual(
                { from: d1, to: d2 },
                { from: parseYMD('2026-04-11'), to: d2 },
            ),
        ).toBe(false);
        // Both null.
        expect(isRangeEqual({ from: null, to: null }, { from: null, to: null })).toBe(
            true,
        );
    });
});

describe('date-picker foundation — range token serialisation', () => {
    it('toRangeToken round-trips through parseRangeToken', () => {
        const r = { from: parseYMD('2026-04-10'), to: parseYMD('2026-04-20') };
        const token = toRangeToken(r);
        expect(token).toBe('2026-04-10|2026-04-20');
        expect(parseRangeToken(token)).toEqual(r);
    });

    it('handles half-open ranges on both sides', () => {
        expect(toRangeToken({ from: parseYMD('2026-01-01'), to: null })).toBe(
            '2026-01-01|',
        );
        expect(toRangeToken({ from: null, to: parseYMD('2026-12-31') })).toBe(
            '|2026-12-31',
        );
    });

    it('parseRangeToken returns empty range for empty input', () => {
        expect(parseRangeToken('')).toEqual({ from: null, to: null });
        expect(parseRangeToken(null)).toEqual({ from: null, to: null });
        expect(parseRangeToken('|')).toEqual({ from: null, to: null });
    });
});

describe('date-picker foundation — DateRange ↔ DateRangeValue', () => {
    it('toDateRangeValue maps undefined fields to null', () => {
        expect(toDateRangeValue({ from: undefined })).toEqual({
            from: null,
            to: null,
        });
    });

    it('fromDateRangeValue maps null fields to undefined', () => {
        const result = fromDateRangeValue({ from: null, to: null });
        expect(result.from).toBeUndefined();
        expect(result.to).toBeUndefined();
    });
});

describe('date-picker foundation — preset catalogue', () => {
    it('Today resolves to the same UTC day for from and to', () => {
        const r = resolveToday(NOW);
        expect(isSameUtcDay(r.from!, r.to!)).toBe(true);
        expect(isSameUtcDay(r.from!, NOW)).toBe(true);
    });

    it('Yesterday resolves to exactly one UTC day ago', () => {
        const y = resolveYesterday(NOW);
        expect(toYMD(y.from)).toBe('2026-04-14');
        expect(toYMD(y.to)).toBe('2026-04-14');
    });

    it('Last 7 days is a 7-day inclusive window ending today', () => {
        const r = resolveLastNDays(7, NOW);
        expect(toYMD(r.from)).toBe('2026-04-09');
        expect(toYMD(r.to)).toBe('2026-04-15');
        // Exactly 7 UTC days in the interval (inclusive)
        const msPerDay = 86_400_000;
        const diff =
            (startOfUtcDay(r.to!).getTime() - startOfUtcDay(r.from!).getTime()) /
            msPerDay;
        expect(diff).toBe(6); // inclusive
    });

    it('Month to date spans from the 1st of the current month to today', () => {
        const r = resolveMonthToDate(NOW);
        expect(toYMD(r.from)).toBe('2026-04-01');
        expect(toYMD(r.to)).toBe('2026-04-15');
    });

    it('Quarter to date spans the Q2 start to today', () => {
        const r = resolveQuarterToDate(NOW);
        expect(toYMD(r.from)).toBe('2026-04-01');
        expect(toYMD(r.to)).toBe('2026-04-15');
    });

    it('Year to date spans Jan 1 to today', () => {
        const r = resolveYearToDate(NOW);
        expect(toYMD(r.from)).toBe('2026-01-01');
        expect(toYMD(r.to)).toBe('2026-04-15');
    });

    it('Last month is the whole of March 2026', () => {
        const r = resolveLastMonth(NOW);
        expect(toYMD(r.from)).toBe('2026-03-01');
        expect(toYMD(r.to)).toBe('2026-03-31');
    });

    it('Last quarter is Q1 2026 (Jan–Mar)', () => {
        const r = resolveLastQuarter(NOW);
        expect(toYMD(r.from)).toBe('2026-01-01');
        expect(toYMD(r.to)).toBe('2026-03-31');
    });

    it('Last year is the whole of 2025', () => {
        const r = resolveLastYear(NOW);
        expect(toYMD(r.from)).toBe('2025-01-01');
        expect(toYMD(r.to)).toBe('2025-12-31');
    });

    it('every default preset resolves to a well-ordered range', () => {
        for (const p of DEFAULT_DATE_RANGE_PRESETS) {
            const r = p.resolve(NOW);
            expect(r.from).not.toBeNull();
            expect(r.to).not.toBeNull();
            expect(r.from!.getTime()).toBeLessThanOrEqual(r.to!.getTime());
        }
    });

    it('every default preset has a unique id', () => {
        const ids = DEFAULT_DATE_RANGE_PRESETS.map((p) => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('selectDateRangePresets preserves canonical order and drops unknowns', () => {
        const picked = selectDateRangePresets(['last-30-days', 'today', 'bogus']);
        expect(picked.map((p) => p.id)).toEqual(['today', 'last-30-days']);
    });
});

describe('date-picker foundation — preset materialisation', () => {
    it('materialises a resolvable range preset into the legacy shape', () => {
        const preset = DEFAULT_DATE_RANGE_PRESETS.find(
            (p) => p.id === 'last-7-days',
        )!;
        const mat = materializeDateRangePreset(preset, NOW);
        expect(mat.id).toBe('last-7-days');
        expect(mat.label).toBe('Last 7 days');
        expect(mat.dateRange.from).toBeInstanceOf(Date);
        expect(mat.dateRange.to).toBeInstanceOf(Date);
        // B1 — `materializeDateRangePreset` now goes through
        // `fromDateRangeValue`, which converts UTC-midnight to
        // LOCAL-midnight so RDP highlights the right day in any
        // timezone. Assert via local Y/M/D — `toYMD` (which reads
        // UTC components) is the wrong probe for an RDP-shaped
        // Date.
        const from = mat.dateRange.from as Date;
        const to = mat.dateRange.to as Date;
        expect(from.getFullYear()).toBe(2026);
        expect(from.getMonth()).toBe(3); // April (0-indexed)
        expect(from.getDate()).toBe(9);
        expect(to.getFullYear()).toBe(2026);
        expect(to.getMonth()).toBe(3);
        expect(to.getDate()).toBe(15);
    });
});
