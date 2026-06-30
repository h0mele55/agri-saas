/**
 * AI Risk Assessment — Stub Provider (Enhanced)
 *
 * Deterministic provider for development/testing AND fallback.
 * Returns asset-type-aware, framework-filtered risk suggestions
 * with confidence scores and structured explainability.
 *
 * This provider doubles as the fallback when no AI backend is available.
 */
import type { RiskAssessmentInput, RiskSuggestion, RiskSuggestionOutput, RiskSuggestionProvider } from './types';
import { ENRICHED_RISK_CATALOG, getAssetTypeProfile, type EnrichedRiskTemplate } from './knowledge-base';

// ─── Stub Provider ───

export class StubRiskSuggestionProvider implements RiskSuggestionProvider {
    readonly providerName = 'stub';
    private readonly isFallbackMode: boolean;

    constructor(isFallbackMode = false) {
        this.isFallbackMode = isFallbackMode;
    }

    async generateSuggestions(input: RiskAssessmentInput): Promise<RiskSuggestionOutput> {
        const assetTypes = new Set(input.assets.map(a => a.type));
        if (assetTypes.size === 0) assetTypes.add('APPLICATION');

        const maxScale = input.maxRiskScale ?? 5;
        const existingControlsLower = new Set(
            (input.existingControls ?? []).map(c => c.toLowerCase())
        );

        // The knowledge base is keyed to information-security asset classes
        // (APPLICATION, DATASTORE, …). A tenant whose assets are of other
        // kinds (e.g. agricultural machinery — TRACTOR, HARVESTER, BUILDING)
        // overlaps with none of them, so asset-type filtering would zero out
        // every suggestion. Detect that case and fall back to framework-only
        // matching so the assessment still produces results.
        const catalogMatchesAnyAssetType = ENRICHED_RISK_CATALOG.some(risk =>
            risk.assetTypes.some(at => assetTypes.has(at))
        );

        // Filter catalog by matching asset types and frameworks
        const applicable = ENRICHED_RISK_CATALOG.filter(risk => {
            const fwMatch = input.frameworks.length === 0 ||
                risk.frameworks.length === 0 ||
                risk.frameworks.some(fw => input.frameworks.some(inputFw =>
                    inputFw.toUpperCase().replace(/\s/g, '').includes(fw.toUpperCase()) ||
                    fw.toUpperCase().includes(inputFw.toUpperCase().replace(/\s/g, ''))
                ));
            const typeMatch = !catalogMatchesAnyAssetType ||
                risk.assetTypes.length === 0 ||
                risk.assetTypes.some(at => assetTypes.has(at));
            return fwMatch && typeMatch;
        });

        // Deduplicate: if same category + same asset type match, prefer higher-fidelity template
        const seen = new Set<string>();
        const deduped = applicable.filter(risk => {
            const key = `${risk.category}:${risk.title.substring(0, 30)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Map to RiskSuggestion with scaled ratings and enrichment
        const suggestions: RiskSuggestion[] = deduped.map(risk => {
            return this.enrichTemplate(risk, input, maxScale, existingControlsLower);
        });

        return {
            suggestions,
            modelName: this.isFallbackMode ? 'fallback-knowledge-base-v2' : 'stub-knowledge-base-v2',
            provider: this.isFallbackMode ? 'fallback' : 'stub',
            isFallback: this.isFallbackMode,
        };
    }

    private enrichTemplate(
        risk: EnrichedRiskTemplate,
        input: RiskAssessmentInput,
        maxScale: number,
        existingControls: Set<string>,
    ): RiskSuggestion {
        // Scale likelihood/impact to tenant's maxRiskScale
        const scaledLikelihood = Math.max(1, Math.min(maxScale, Math.round(risk.likelihood * maxScale / 5)));
        const scaledImpact = Math.max(1, Math.min(maxScale, Math.round(risk.impact * maxScale / 5)));

        // Match to a specific asset
        const matchedAsset = input.assets.find(a => risk.assetTypes.includes(a.type));

        // Adjust confidence based on context specificity
        let confidence = risk.confidence;
        if (matchedAsset) {
            // Boost confidence if we have a concrete asset match with criticality
            if (matchedAsset.criticality === 'HIGH') confidence = 'high';
        } else if (input.assets.length > 0) {
            // Lower confidence if we have assets but none match this template's types
            confidence = 'low';
        }

        // Reduce suggestedControls that the tenant already has
        const filteredControls = risk.suggestedControls.filter(
            c => !existingControls.has(c.toLowerCase())
        );

        // Enrich structuredRationale with asset-specific characteristics
        const enrichedCharacteristics = [...risk.structuredRationale.affectedAssetCharacteristics];
        if (matchedAsset) {
            const profile = getAssetTypeProfile(matchedAsset.type);
            // Add 1-2 type-specific characteristics that aren't already included
            for (const char of profile.keyCharacteristics.slice(0, 2)) {
                if (!enrichedCharacteristics.includes(char)) {
                    enrichedCharacteristics.push(char);
                }
            }
        }

        return {
            title: risk.title,
            description: risk.description,
            category: risk.category,
            threat: risk.threat,
            vulnerability: risk.vulnerability,
            likelihood: scaledLikelihood,
            impact: scaledImpact,
            rationale: risk.rationale,
            suggestedControls: filteredControls.length > 0 ? filteredControls : risk.suggestedControls,
            relatedAssetName: matchedAsset?.name,
            confidence,
            structuredRationale: {
                ...risk.structuredRationale,
                affectedAssetCharacteristics: enrichedCharacteristics,
            },
            isFallback: this.isFallbackMode,
        };
    }
}
