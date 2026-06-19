'use client';

import { useEffect, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { hasSeenCoachMark, markCoachMarkSeen } from '@/lib/coach-marks';
import { cn } from '@/lib/cn';

/**
 * CoachMark — a first-time-only hint anchored to a UI element.
 *
 * Wrap the element you want to point at; the bubble renders once per
 * browser (keyed by `id` via `@/lib/coach-marks`) and never again after
 * the user taps "Got it". The decision is made AFTER mount (`show` starts
 * false, an effect flips it on only for a first-timer) so there's no SSR
 * mismatch and no flash for returning users.
 *
 * No shadow / no entrance animation by design — keeps the bubble clear of
 * the shadow-discipline + motion-language ratchets, and a hint that simply
 * appears is inherently reduced-motion-safe.
 */

export type CoachMarkPlacement = 'top' | 'bottom' | 'left' | 'right';

interface CoachMarkProps {
    /** Stable id — the localStorage dedupe key (shown exactly once). */
    id: string;
    title: string;
    body: string;
    placement?: CoachMarkPlacement;
    children: ReactNode;
    /** Classes on the relative wrapper (e.g. to make it inline-block). */
    className?: string;
}

const PLACEMENT_POS: Record<CoachMarkPlacement, string> = {
    top: 'bottom-full left-0 mb-2',
    bottom: 'top-full left-0 mt-2',
    left: 'right-full top-0 mr-2',
    right: 'left-full top-0 ml-2',
};

export function CoachMark({
    id,
    title,
    body,
    placement = 'bottom',
    children,
    className,
}: CoachMarkProps) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (!hasSeenCoachMark(id)) setShow(true);
    }, [id]);

    function dismiss() {
        markCoachMarkSeen(id);
        setShow(false);
    }

    return (
        <div className={cn('relative', className)}>
            {children}
            {show && (
                <div
                    role="dialog"
                    aria-label={title}
                    className={cn(
                        'absolute z-30 w-64 rounded-lg border border-border-default bg-bg-default p-default',
                        PLACEMENT_POS[placement],
                    )}
                >
                    <p className="text-sm font-semibold text-content-primary">{title}</p>
                    <p className="mt-1 text-xs text-content-secondary">{body}</p>
                    <div className="mt-default flex justify-end">
                        <Button variant="primary" size="sm" onClick={dismiss}>
                            Got it
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
