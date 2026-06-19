/**
 * Guided first-run flow (feat/delight-onboarding) — the pure progress
 * derivation + the dismiss-key shape. The card itself is a thin render
 * over these; locking the data contract here keeps the ring honest
 * (it can only show "done" when the underlying signal is true) and the
 * dedupe key stable (it rides in localStorage).
 */
import {
    FIRST_RUN_STEPS,
    firstRunProgress,
    firstRunDismissKey,
    type FirstRunSignals,
} from '@/lib/onboarding-steps';

describe('FIRST_RUN_STEPS', () => {
    it('is the two-step "map a field → log a job" flow', () => {
        expect(FIRST_RUN_STEPS.map((s) => s.id)).toEqual([
            'first-field-mapped',
            'first-job-logged',
        ]);
        // Every step carries a CTA, a destination, and a reason — the card
        // renders all three, so none may be empty.
        for (const step of FIRST_RUN_STEPS) {
            expect(step.label.length).toBeGreaterThan(0);
            expect(step.hint.length).toBeGreaterThan(0);
            expect(step.cta.length).toBeGreaterThan(0);
            expect(step.href.startsWith('/')).toBe(true);
        }
    });
});

describe('firstRunProgress', () => {
    const run = (s: FirstRunSignals) => firstRunProgress(s);

    it('nothing done → 0/2, not complete', () => {
        const p = run({ fieldMapped: false, jobLogged: false });
        expect(p.completedCount).toBe(0);
        expect(p.total).toBe(2);
        expect(p.allComplete).toBe(false);
        expect(p.steps.every((s) => !s.done)).toBe(true);
    });

    it('field mapped only → 1/2, the field step is the done one', () => {
        const p = run({ fieldMapped: true, jobLogged: false });
        expect(p.completedCount).toBe(1);
        expect(p.allComplete).toBe(false);
        expect(p.steps.find((s) => s.step.id === 'first-field-mapped')?.done).toBe(true);
        expect(p.steps.find((s) => s.step.id === 'first-job-logged')?.done).toBe(false);
    });

    it('both signals true → 2/2, complete (card self-hides)', () => {
        const p = run({ fieldMapped: true, jobLogged: true });
        expect(p.completedCount).toBe(2);
        expect(p.allComplete).toBe(true);
    });
});

describe('firstRunDismissKey', () => {
    it('namespaces under the inflect onboarding prefix, scoped per tenant', () => {
        expect(firstRunDismissKey('tenant_abc')).toBe(
            'inflect:onboarding-firstrun:dismissed:tenant_abc',
        );
        // Distinct tenants get distinct keys.
        expect(firstRunDismissKey('t1')).not.toBe(firstRunDismissKey('t2'));
    });
});
