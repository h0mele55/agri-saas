/**
 * @jest-environment jsdom
 *
 * First-time coach-mark dedupe (feat/delight-onboarding). The bubble shows
 * exactly once per browser; this pins the localStorage contract + the
 * fail-soft behaviour (private mode must never crash the host page).
 */
import {
    coachMarkKey,
    hasSeenCoachMark,
    markCoachMarkSeen,
    clearCoachMark,
} from '@/lib/coach-marks';

describe('coach-mark dedupe', () => {
    beforeEach(() => window.localStorage.clear());

    it('namespaces the key under the inflect coachmark prefix', () => {
        expect(coachMarkKey('map-locate')).toBe('inflect.coachmark:map-locate');
    });

    it('is unseen before mark, seen after', () => {
        expect(hasSeenCoachMark('map-locate')).toBe(false);
        markCoachMarkSeen('map-locate');
        expect(hasSeenCoachMark('map-locate')).toBe(true);
    });

    it('clear lets the hint show again', () => {
        markCoachMarkSeen('field-op-wizard');
        expect(hasSeenCoachMark('field-op-wizard')).toBe(true);
        clearCoachMark('field-op-wizard');
        expect(hasSeenCoachMark('field-op-wizard')).toBe(false);
    });

    it('different ids are independent', () => {
        markCoachMarkSeen('map-locate');
        expect(hasSeenCoachMark('field-op-wizard')).toBe(false);
    });

    it('survives storage throwing (private mode) without crashing', () => {
        const setSpy = jest
            .spyOn(Storage.prototype, 'setItem')
            .mockImplementation(() => {
                throw new Error('quota');
            });
        const getSpy = jest
            .spyOn(Storage.prototype, 'getItem')
            .mockImplementation(() => {
                throw new Error('disabled');
            });
        try {
            expect(() => markCoachMarkSeen('map-locate')).not.toThrow();
            // Fail-soft: an unreadable store reads as "not seen" so the hint
            // still appears (just won't persist as dismissed).
            expect(hasSeenCoachMark('map-locate')).toBe(false);
        } finally {
            setSpy.mockRestore();
            getSpy.mockRestore();
        }
    });
});
