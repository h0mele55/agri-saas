'use client';

import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format-date';
import type { LocationSmartDefaults } from '@/app-layer/usecases/smart-defaults';

/**
 * SmartDefaultsBanner — surfaces today's spray-window suitability and the
 * next crop-plan milestone for THIS field, so the operator sees "is it a
 * good day to spray, and what's coming up" without leaving the location.
 *
 * Both are read from the recall payload (derived from existing weather +
 * planting rows — no ML); the banner renders nothing when neither signal is
 * available, so an unconfigured tenant never sees empty chrome.
 */

const SPRAY_TONE: Record<'GOOD' | 'CAUTION' | 'UNSUITABLE', string> = {
    GOOD: 'text-content-success',
    CAUTION: 'text-content-warning',
    UNSUITABLE: 'text-content-error',
};

const SPRAY_LABEL: Record<'GOOD' | 'CAUTION' | 'UNSUITABLE', string> = {
    GOOD: 'Good to spray',
    CAUTION: 'Spray with caution',
    UNSUITABLE: 'Not a good spray day',
};

const STAGE_LABEL: Record<'sow' | 'transplant' | 'harvest', string> = {
    sow: 'Sow',
    transplant: 'Transplant',
    harvest: 'Harvest',
};

export function SmartDefaultsBanner({ data }: { data?: LocationSmartDefaults | null }) {
    const sprayWindow = data?.sprayWindow ?? null;
    const nextPlanting = data?.nextPlanting ?? null;
    if (!sprayWindow && !nextPlanting) return null;

    return (
        <Card density="compact" className="flex flex-wrap items-center gap-x-section gap-y-tight">
            {sprayWindow && (
                <div className="min-w-0">
                    <p className="text-xs text-content-secondary">Spray window today</p>
                    <p className={cn('text-sm font-medium', SPRAY_TONE[sprayWindow.status])}>
                        {SPRAY_LABEL[sprayWindow.status]}
                    </p>
                    {sprayWindow.reasons.length > 0 && (
                        <p className="text-xs text-content-muted">{sprayWindow.reasons.join(' · ')}</p>
                    )}
                </div>
            )}
            {nextPlanting && (
                <div className="min-w-0">
                    <p className="text-xs text-content-secondary">Next crop-plan task</p>
                    <p className="text-sm font-medium">
                        {STAGE_LABEL[nextPlanting.stage]} {nextPlanting.label}
                    </p>
                    <p className="text-xs text-content-muted">{formatDate(new Date(nextPlanting.date))}</p>
                </div>
            )}
        </Card>
    );
}

export default SmartDefaultsBanner;
