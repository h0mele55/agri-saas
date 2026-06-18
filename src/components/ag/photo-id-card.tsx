'use client';

import { AiSuggestionCard, type AiConfidence } from './ai-suggestion-card';
import { StatusBadge } from '@/components/ui/status-badge';

/** Shape persisted at `LogEntry.attributesJson.pestId` by the vision job. */
export interface PhotoIdData {
    identified: boolean;
    category: 'PEST' | 'DISEASE' | 'DEFICIENCY' | 'HEALTHY' | 'UNKNOWN';
    name: string | null;
    recommendation: string;
    confidence: AiConfidence;
    model?: string;
    generatedAt?: string;
}

const CATEGORY_VARIANT: Record<PhotoIdData['category'], 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
    PEST: 'warning',
    DISEASE: 'error',
    DEFICIENCY: 'warning',
    HEALTHY: 'success',
    UNKNOWN: 'neutral',
};

/** Render the async photo pest/disease identification, if present. */
export function PhotoIdCard({ data }: { data: PhotoIdData | null | undefined }) {
    if (!data) return null;
    const title = data.identified && data.name ? data.name : 'Photo analysed';
    return (
        <AiSuggestionCard title={title} confidence={data.confidence} meta={data.model ?? null}>
            <div className="flex items-center gap-tight mb-1">
                <StatusBadge variant={CATEGORY_VARIANT[data.category]} size="sm">
                    {data.category.charAt(0) + data.category.slice(1).toLowerCase()}
                </StatusBadge>
            </div>
            <p>{data.recommendation}</p>
        </AiSuggestionCard>
    );
}
