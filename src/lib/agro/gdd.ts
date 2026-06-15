/**
 * Growing Degree Days (GDD) — PURE accumulation math.
 *
 * GDD is the standard agronomic heat-unit measure driving crop
 * development: a crop "matures" after accumulating a variety-specific GDD
 * total from sowing. This module is a clean-room implementation of the
 * conventional AVERAGE method with an optional upper cap — derived from
 * published agronomy (not transcribed from any source). No DB, no I/O;
 * the usecase layer feeds it WeatherObservation rows.
 *
 * Method (per day):
 *   tmax' = min(tmax, cap)            (cap unset ⇒ no upper clamp)
 *   tmin' = max(min(tmin, cap), base) (floor at base — heat below base
 *                                       contributes nothing)
 *   gdd   = max(0, (tmax' + tmin')/2 − base)
 * The cap + floor are the widely-used refinements that stop very hot days
 * over-counting and very cold days under-counting.
 */

export interface DailyTemp {
    /** ISO date (YYYY-MM-DD) — carried through to the per-day output. */
    date: string;
    tempMaxC: number;
    tempMinC: number;
}

export interface GddOptions {
    /** Base (threshold) temperature in °C below which no growth accrues. */
    baseTempC: number;
    /** Optional upper cap in °C (e.g. 30 for many crops). null ⇒ uncapped. */
    capTempC?: number | null;
}

export interface GddDay {
    date: string;
    /** GDD accrued on this day (>= 0). */
    gdd: number;
    /** Running cumulative GDD up to and including this day. */
    cumulative: number;
}

export interface GddResult {
    totalGdd: number;
    days: GddDay[];
}

/** GDD for a single day's max/min via the average method (cap + floor). */
export function dailyGdd(tempMaxC: number, tempMinC: number, opts: GddOptions): number {
    const base = opts.baseTempC;
    const cap = opts.capTempC ?? null;
    let tmax = cap != null ? Math.min(tempMaxC, cap) : tempMaxC;
    let tmin = cap != null ? Math.min(tempMinC, cap) : tempMinC;
    // Floor both at base — sub-base hours contribute no heat units.
    tmax = Math.max(tmax, base);
    tmin = Math.max(tmin, base);
    const avg = (tmax + tmin) / 2;
    return round2(Math.max(0, avg - base));
}

/**
 * Accumulate GDD over a chronological run of daily observations. The
 * caller is responsible for passing the right window (e.g. sow date →
 * today) in date order; this function sums them and emits the running
 * cumulative so a UI can plot the curve and compare against a variety's
 * GDD-to-maturity target.
 */
export function accumulateGdd(obs: DailyTemp[], opts: GddOptions): GddResult {
    let cumulative = 0;
    const days: GddDay[] = [];
    for (const o of obs) {
        const gdd = dailyGdd(o.tempMaxC, o.tempMinC, opts);
        cumulative = round2(cumulative + gdd);
        days.push({ date: o.date, gdd, cumulative });
    }
    return { totalGdd: cumulative, days };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
