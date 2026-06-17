'use client';

import { AiSuggestionCard, type AiConfidence } from './ai-suggestion-card';

/** Shape persisted at `AgroSignal.detailsJson.copilot` by the copilot job. */
export interface CopilotData {
    explanation: string;
    factors: string[];
    whatIf: string;
    confidence: AiConfidence;
    model?: string;
    generatedAt?: string;
}

/** Render the agronomy-copilot explanation for a fired signal, if present. */
export function CopilotCard({ data }: { data: CopilotData | null | undefined }) {
    if (!data) return null;
    return (
        <AiSuggestionCard title="Agronomy copilot" confidence={data.confidence} meta={data.model ?? null}>
            <p>{data.explanation}</p>
            {data.factors.length > 0 && (
                <ul className="list-disc pl-4 space-y-tight">
                    {data.factors.map((f, i) => (
                        <li key={i}>{f}</li>
                    ))}
                </ul>
            )}
            {data.whatIf && (
                <p className="text-content-subtle">
                    <span className="font-medium text-content-muted">What if:</span> {data.whatIf}
                </p>
            )}
        </AiSuggestionCard>
    );
}
