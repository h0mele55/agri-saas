/**
 * B1 — calendar TZ offset bug. Unit-test the symmetric
 * local-midnight ↔ UTC-midnight bridges so a future refactor
 * cannot silently regress to "click May 24, store May 23".
 *
 * `toDateRangeValue` consumes the local-midnight Date that
 * react-day-picker emits and produces UTC-midnight Dates suitable
 * for our `getUTCDate()`-reading downstream (`toYMD`, etc.).
 * `fromDateRangeValue` is the inverse — bridges stored UTC-midnight
 * back to local-midnight so RDP highlights the right day.
 */
import {
    toDateRangeValue,
    fromDateRangeValue,
    toYMD,
    parseYMD,
} from '@/components/ui/date-picker/date-utils';

describe('date-picker TZ bridge (B1 calendar offset fix)', () => {
    it('local-midnight → UTC-midnight: getUTCDate matches the calendar day', () => {
        // The shape RDP emits on click: local midnight of the
        // clicked day. In any timezone, getFullYear/getMonth/
        // getDate report the calendar day.
        const localMidnight = new Date(2026, 4, 24); // May 24
        const out = toDateRangeValue({ from: localMidnight, to: undefined });
        expect(out.from).not.toBeNull();
        expect(out.to).toBeNull();
        const utc = out.from as Date;
        expect(utc.getUTCFullYear()).toBe(2026);
        expect(utc.getUTCMonth()).toBe(4);
        expect(utc.getUTCDate()).toBe(24);
    });

    it('UTC-midnight → local-midnight: round-trips the calendar day', () => {
        // The shape the rest of the app stores: a Date whose UTC
        // components ARE the canonical day. `fromDateRangeValue`
        // must hand RDP a Date whose LOCAL components match — same
        // calendar day, regardless of the runner's TZ.
        const utcMidnight = new Date(Date.UTC(2026, 4, 24));
        const out = fromDateRangeValue({ from: utcMidnight, to: null });
        const local = out.from as Date;
        expect(local).toBeDefined();
        expect(local.getFullYear()).toBe(2026);
        expect(local.getMonth()).toBe(4);
        expect(local.getDate()).toBe(24);
    });

    it('full round-trip through toYMD survives unchanged', () => {
        // The original report: "click on May 24 → task is scheduled
        // for May 23." That symptom needs the round-trip
        //   local-midnight → UTC-midnight → toYMD
        // to land back on May 24. Lock the round-trip.
        const clicked = new Date(2026, 4, 24);
        const { from } = toDateRangeValue({ from: clicked, to: undefined });
        expect(toYMD(from)).toBe('2026-05-24');
    });

    it('parseYMD → fromDateRangeValue → RDP-local preserves the day', () => {
        // Reverse direction: the URL or stored value is `2026-05-24`.
        // parseYMD → UTC-midnight. fromDateRangeValue → local-midnight
        // with the SAME Y/M/D so the calendar highlights the 24th.
        const stored = parseYMD('2026-05-24');
        const out = fromDateRangeValue({ from: stored, to: null });
        const local = out.from as Date;
        expect(local.getFullYear()).toBe(2026);
        expect(local.getMonth()).toBe(4);
        expect(local.getDate()).toBe(24);
    });

    it('handles null on both directions', () => {
        const empty = toDateRangeValue({ from: undefined, to: undefined });
        expect(empty.from).toBeNull();
        expect(empty.to).toBeNull();
        const fromNull = fromDateRangeValue({ from: null, to: null });
        expect(fromNull.from).toBeUndefined();
        expect(fromNull.to).toBeUndefined();
    });
});
