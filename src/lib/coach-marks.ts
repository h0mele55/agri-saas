/**
 * First-time coach-marks — "show this hint exactly once per browser."
 *
 * Mirrors the localStorage dedupe in `celebrations.ts`, and for the same
 * reason: a one-time hint must decide show/hide on its FIRST render, but
 * the `useLocalStorage` hook defers hydration (returns its initial value
 * on the first render to keep SSR + client markup identical), so a
 * fire-once check can't use it without a flash for returning users. Raw
 * localStorage in this lib layer is fine — the `src/app/**` ban (Epic 60)
 * targets UI components reaching past the hook, not shared lib helpers.
 *
 * SSR-safe; fails soft (private mode → the hint simply shows every time
 * rather than crashing).
 */

const COACH_MARK_PREFIX = 'inflect.coachmark:';

export function coachMarkKey(id: string): string {
    return `${COACH_MARK_PREFIX}${id}`;
}

/** True once the hint has been dismissed in this browser. */
export function hasSeenCoachMark(id: string): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem(coachMarkKey(id)) !== null;
    } catch {
        // Storage unavailable — treat as "not seen" so a first-timer still
        // gets the hint; it just won't persist as dismissed.
        return false;
    }
}

/** Record that the hint has been seen — idempotent, SSR-safe. */
export function markCoachMarkSeen(id: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(coachMarkKey(id), new Date().toISOString());
    } catch {
        /* private mode — the hint just isn't deduped persistently */
    }
}

/** Test / "reset onboarding" helper — let a coach-mark show again. */
export function clearCoachMark(id: string): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.removeItem(coachMarkKey(id));
    } catch {
        /* nothing to clear */
    }
}
