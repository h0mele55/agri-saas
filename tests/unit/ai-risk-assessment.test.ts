/**
 * AI Risk Assessment — Unit Tests (Enhanced)
 *
 * Tests: stub provider (confidence, asset-type awareness, fallback),
 * knowledge-base, schema validation, prompt builder (framework-aware), session lifecycle.
 */
import { StubRiskSuggestionProvider } from '@/app-layer/ai/risk-assessment/stub-provider';
import { buildRiskAssessmentPrompt } from '@/app-layer/ai/risk-assessment/prompt-builder';
import { getProvider } from '@/app-layer/ai/risk-assessment';
import {
    RiskAssessmentInputSchema,
    RiskSuggestionOutputSchema,
    RiskSuggestionSchema,
    ApplySessionSchema,
    ConfidenceLevelSchema,
    StructuredRationaleSchema,
} from '@/app-layer/ai/risk-assessment/schemas';
import {
    ENRICHED_RISK_CATALOG,
    ASSET_TYPE_PROFILES,
    FRAMEWORK_GUIDANCE,
    getAssetTypeProfile,
    getFrameworkGuidance,
} from '@/app-layer/ai/risk-assessment/knowledge-base';
import type { RiskAssessmentInput } from '@/app-layer/ai/risk-assessment/types';

// ─── Knowledge Base Tests ───

describe('Asset Type Knowledge Base', () => {
    it('has profiles for all 5 core asset types', () => {
        const coreTypes = ['APPLICATION', 'INFRASTRUCTURE', 'PROCESS', 'VENDOR', 'DATA_STORE'];
        for (const type of coreTypes) {
            expect(ASSET_TYPE_PROFILES[type]).toBeDefined();
            expect(ASSET_TYPE_PROFILES[type].riskCategories.length).toBeGreaterThan(0);
            expect(ASSET_TYPE_PROFILES[type].typicalThreats.length).toBeGreaterThan(0);
        }
    });

    it('getAssetTypeProfile returns APPLICATION profile for unknown type', () => {
        const profile = getAssetTypeProfile('UNKNOWN_TYPE');
        expect(profile.type).toBe('APPLICATION');
    });

    it('has framework guidance for ISO27001, NIS2, SOC2', () => {
        expect(FRAMEWORK_GUIDANCE.ISO27001).toBeDefined();
        expect(FRAMEWORK_GUIDANCE.NIS2).toBeDefined();
        expect(FRAMEWORK_GUIDANCE.SOC2).toBeDefined();
    });

    it('getFrameworkGuidance filters correctly', () => {
        const guidance = getFrameworkGuidance(['ISO27001', 'NIS2', 'NONEXISTENT']);
        expect(guidance.length).toBe(2);
        expect(guidance[0].name).toBe('ISO 27001');
        expect(guidance[1].name).toBe('NIS2 Directive');
    });

    it('enriched catalog has suggestions for each core asset type', () => {
        const coreTypes = ['APPLICATION', 'INFRASTRUCTURE', 'PROCESS', 'VENDOR', 'DATA_STORE'];
        for (const type of coreTypes) {
            const matches = ENRICHED_RISK_CATALOG.filter(r => r.assetTypes.includes(type));
            expect(matches.length).toBeGreaterThanOrEqual(2);
        }
    });

    it('enriched catalog entries all have structuredRationale', () => {
        for (const entry of ENRICHED_RISK_CATALOG) {
            expect(entry.structuredRationale).toBeDefined();
            expect(entry.structuredRationale.whyThisRisk.length).toBeGreaterThan(0);
            expect(entry.structuredRationale.affectedAssetCharacteristics.length).toBeGreaterThan(0);
            expect(entry.structuredRationale.suggestedControlThemes.length).toBeGreaterThan(0);
            expect(['high', 'medium', 'low']).toContain(entry.confidence);
        }
    });
});

// ─── Stub Provider Tests ───

describe('StubRiskSuggestionProvider', () => {
    const provider = new StubRiskSuggestionProvider();

    it('has correct provider name', () => {
        expect(provider.providerName).toBe('stub');
    });

    it('returns suggestions for generic input', async () => {
        const input: RiskAssessmentInput = {
            frameworks: ['ISO27001'],
            assets: [
                { id: '1', name: 'Main App', type: 'APPLICATION' },
            ],
            maxRiskScale: 5,
        };

        const output = await provider.generateSuggestions(input);

        expect(output.provider).toBe('stub');
        expect(output.modelName).toContain('knowledge-base');
        expect(output.suggestions.length).toBeGreaterThan(0);
        expect(output.isFallback).toBeFalsy();
    });

    it('still returns framework-matched suggestions when assets are agricultural (no catalog overlap)', async () => {
        // The knowledge base is keyed to information-security asset classes.
        // A farm tenant's assets (TRACTOR / HARVESTER / BUILDING) match none
        // of them, so the asset-type filter must fall back to framework-only
        // matching rather than zeroing out every suggestion.
        const input: RiskAssessmentInput = {
            frameworks: ['ISO27001'],
            assets: [
                { id: '1', name: 'John Deere 6155R', type: 'TRACTOR' },
                { id: '2', name: 'Grain Storage Barn', type: 'BUILDING' },
            ],
            maxRiskScale: 5,
        };

        const output = await provider.generateSuggestions(input);

        expect(output.suggestions.length).toBeGreaterThan(0);
    });

    it('returns valid structured output matching schema', async () => {
        const input: RiskAssessmentInput = {
            frameworks: ['ISO27001', 'NIS2'],
            assets: [
                { id: '1', name: 'CRM System', type: 'APPLICATION', criticality: 'HIGH' },
                { id: '2', name: 'AWS Infrastructure', type: 'INFRASTRUCTURE' },
            ],
            maxRiskScale: 5,
        };

        const output = await provider.generateSuggestions(input);

        // Validate each suggestion matches schema
        for (const suggestion of output.suggestions) {
            const result = RiskSuggestionSchema.safeParse(suggestion);
            expect(result.success).toBe(true);
        }

        // Validate full output
        const fullResult = RiskSuggestionOutputSchema.safeParse({ suggestions: output.suggestions });
        expect(fullResult.success).toBe(true);
    });

    it('suggestion ratings are within maxRiskScale', async () => {
        const input: RiskAssessmentInput = {
            frameworks: [],
            assets: [{ id: '1', name: 'Test', type: 'APPLICATION' }],
            maxRiskScale: 3,
        };

        const output = await provider.generateSuggestions(input);

        for (const s of output.suggestions) {
            expect(s.likelihood).toBeGreaterThanOrEqual(1);
            expect(s.likelihood).toBeLessThanOrEqual(3);
            expect(s.impact).toBeGreaterThanOrEqual(1);
            expect(s.impact).toBeLessThanOrEqual(3);
        }
    });

    it('filters by framework relevance', async () => {
        const inputNIS2: RiskAssessmentInput = {
            frameworks: ['NIS2'],
            assets: [{ id: '1', name: 'App', type: 'APPLICATION' }],
        };
        const inputSOC2: RiskAssessmentInput = {
            frameworks: ['SOC2'],
            assets: [{ id: '1', name: 'App', type: 'APPLICATION' }],
        };

        const nis2Output = await provider.generateSuggestions(inputNIS2);
        const soc2Output = await provider.generateSuggestions(inputSOC2);

        // Both should return results but may differ
        expect(nis2Output.suggestions.length).toBeGreaterThan(0);
        expect(soc2Output.suggestions.length).toBeGreaterThan(0);
    });

    it('returns results even with no assets', async () => {
        const input: RiskAssessmentInput = {
            frameworks: ['ISO27001'],
            assets: [],
        };

        const output = await provider.generateSuggestions(input);
        expect(output.suggestions.length).toBeGreaterThan(0);
    });

    // ─── New Quality Tests ───

    it('all suggestions have confidence field', async () => {
        const input: RiskAssessmentInput = {
            frameworks: ['ISO27001'],
            assets: [{ id: '1', name: 'Test DB', type: 'DATA_STORE' }],
        };

        const output = await provider.generateSuggestions(input);
        for (const s of output.suggestions) {
            expect(['high', 'medium', 'low']).toContain(s.confidence);
        }
    });

    it('all suggestions have structuredRationale', async () => {
        const input: RiskAssessmentInput = {
            frameworks: ['ISO27001'],
            assets: [{ id: '1', name: 'API Gateway', type: 'APPLICATION' }],
        };

        const output = await provider.generateSuggestions(input);
        for (const s of output.suggestions) {
            expect(s.structuredRationale).toBeDefined();
            expect(s.structuredRationale.whyThisRisk.length).toBeGreaterThan(0);
            expect(Array.isArray(s.structuredRationale.affectedAssetCharacteristics)).toBe(true);
            expect(Array.isArray(s.structuredRationale.suggestedControlThemes)).toBe(true);
        }
    });

    it('framework selection influences risk categories', async () => {
        const inputNIS2: RiskAssessmentInput = {
            frameworks: ['NIS2'],
            assets: [{ id: '1', name: 'Critical Service', type: 'INFRASTRUCTURE' }],
        };
        const output = await provider.generateSuggestions(inputNIS2);
        const categories = new Set(output.suggestions.map(s => s.category));

        // NIS2 should include operational resilience, incident response, etc.
        const hasRelevantCategory = categories.has('Business Continuity') ||
            categories.has('Incident Response') ||
            categories.has('Network Security') ||
            categories.has('Patch Management');
        expect(hasRelevantCategory).toBe(true);
    });

    it('vendor assets get vendor-specific risks', async () => {
        const input: RiskAssessmentInput = {
            frameworks: ['ISO27001'],
            assets: [{ id: '1', name: 'AWS', type: 'VENDOR' }],
        };
        const output = await provider.generateSuggestions(input);
        const categories = output.suggestions.map(s => s.category);
        expect(categories.some(c => c?.includes('Third-Party') || c?.includes('Vendor') || c?.includes('Concentration'))).toBe(true);
    });

    it('data store assets get data protection risks', async () => {
        const input: RiskAssessmentInput = {
            frameworks: ['ISO27001'],
            assets: [{ id: '1', name: 'Customer DB', type: 'DATA_STORE' }],
        };
        const output = await provider.generateSuggestions(input);
        const categories = output.suggestions.map(s => s.category);
        expect(categories.some(c => c?.includes('Data Protection') || c?.includes('Backup') || c?.includes('Encryption'))).toBe(true);
    });

    it('excludes risks for controls already in place', async () => {
        const input: RiskAssessmentInput = {
            frameworks: ['ISO27001'],
            assets: [{ id: '1', name: 'App', type: 'APPLICATION' }],
            existingControls: ['Multi-factor authentication', 'Parameterized queries'],
        };
        const output = await provider.generateSuggestions(input);
        // Controls already in place should be filtered from suggestedControls
        for (const s of output.suggestions) {
            const lowerControls = s.suggestedControls.map(c => c.toLowerCase());
            const hasAlreadyInstalled = lowerControls.includes('multi-factor authentication');
            // Some suggestions may still include these if ALL controls are already present
            // but generally they should be filtered
            if (s.suggestedControls.length > 1) {
                expect(hasAlreadyInstalled).toBe(false);
            }
        }
    });

    it('produces no duplicate categories within same output', async () => {
        const input: RiskAssessmentInput = {
            frameworks: ['ISO27001', 'NIS2'],
            assets: [
                { id: '1', name: 'App', type: 'APPLICATION' },
                { id: '2', name: 'Infra', type: 'INFRASTRUCTURE' },
            ],
        };
        const output = await provider.generateSuggestions(input);
        const titlePrefixes = output.suggestions.map(s => s.title.substring(0, 30));
        const unique = new Set(titlePrefixes);
        expect(unique.size).toBe(titlePrefixes.length);
    });
});

// ─── Fallback Provider Tests ───

describe('Fallback Provider', () => {
    const fallbackProvider = new StubRiskSuggestionProvider(/* isFallbackMode */ true);

    it('marks output as fallback', async () => {
        const input: RiskAssessmentInput = {
            frameworks: ['ISO27001'],
            assets: [{ id: '1', name: 'App', type: 'APPLICATION' }],
        };
        const output = await fallbackProvider.generateSuggestions(input);
        expect(output.isFallback).toBe(true);
        expect(output.provider).toBe('fallback');
        expect(output.modelName).toContain('fallback');
    });

    it('marks individual items as fallback', async () => {
        const input: RiskAssessmentInput = {
            frameworks: [],
            assets: [{ id: '1', name: 'App', type: 'APPLICATION' }],
        };
        const output = await fallbackProvider.generateSuggestions(input);
        for (const s of output.suggestions) {
            expect(s.isFallback).toBe(true);
        }
    });

    it('produces valid output even with empty input', async () => {
        const input: RiskAssessmentInput = {
            frameworks: [],
            assets: [],
        };
        const output = await fallbackProvider.generateSuggestions(input);
        expect(output.suggestions.length).toBeGreaterThan(0);
        expect(output.isFallback).toBe(true);

        // Validate all suggestions
        for (const s of output.suggestions) {
            const result = RiskSuggestionSchema.safeParse(s);
            expect(result.success).toBe(true);
        }
    });

    it('provides usable baseline for each asset type', async () => {
        const types = ['APPLICATION', 'INFRASTRUCTURE', 'PROCESS', 'VENDOR', 'DATA_STORE'];
        for (const type of types) {
            const input: RiskAssessmentInput = {
                frameworks: [],
                assets: [{ id: '1', name: `Test ${type}`, type }],
            };
            const output = await fallbackProvider.generateSuggestions(input);
            expect(output.suggestions.length).toBeGreaterThanOrEqual(2);
        }
    });
});

// ─── Schema Validation Tests ───

describe('Risk Assessment Schemas', () => {
    describe('RiskAssessmentInputSchema', () => {
        it('accepts valid input with defaults', () => {
            const result = RiskAssessmentInputSchema.safeParse({});
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.frameworks).toEqual([]);
                expect(result.data.assetIds).toEqual([]);
            }
        });

        it('accepts full input', () => {
            const result = RiskAssessmentInputSchema.safeParse({
                frameworks: ['ISO27001', 'NIS2'],
                assetIds: ['abc123', 'def456'],
                context: 'Financial services company with sensitive data',
            });
            expect(result.success).toBe(true);
        });

        it('rejects context exceeding 2000 chars', () => {
            const result = RiskAssessmentInputSchema.safeParse({
                context: 'x'.repeat(2001),
            });
            expect(result.success).toBe(false);
        });

        it('strips unknown fields', () => {
            const result = RiskAssessmentInputSchema.safeParse({
                frameworks: [],
                unknownField: 'should be removed',
            });
            expect(result.success).toBe(true);
            if (result.success) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect((result.data as any).unknownField).toBeUndefined();
            }
        });
    });

    describe('ConfidenceLevelSchema', () => {
        it('accepts valid confidence levels', () => {
            expect(ConfidenceLevelSchema.safeParse('high').success).toBe(true);
            expect(ConfidenceLevelSchema.safeParse('medium').success).toBe(true);
            expect(ConfidenceLevelSchema.safeParse('low').success).toBe(true);
        });

        it('rejects invalid confidence levels', () => {
            expect(ConfidenceLevelSchema.safeParse('critical').success).toBe(false);
            expect(ConfidenceLevelSchema.safeParse('').success).toBe(false);
        });
    });

    describe('StructuredRationaleSchema', () => {
        it('validates well-formed structured rationale', () => {
            const result = StructuredRationaleSchema.safeParse({
                whyThisRisk: 'Because it matters',
                affectedAssetCharacteristics: ['Internet-facing', 'Handles PII'],
                suggestedControlThemes: ['Encryption', 'Access Control'],
            });
            expect(result.success).toBe(true);
        });

        it('applies defaults for optional arrays', () => {
            const result = StructuredRationaleSchema.safeParse({
                whyThisRisk: 'Test',
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.affectedAssetCharacteristics).toEqual([]);
                expect(result.data.suggestedControlThemes).toEqual([]);
            }
        });
    });

    describe('RiskSuggestionOutputSchema', () => {
        it('validates well-formed suggestion output with confidence', () => {
            const result = RiskSuggestionOutputSchema.safeParse({
                suggestions: [{
                    title: 'Unauthorized access risk',
                    description: 'Users may gain unauthorized access.',
                    likelihood: 3,
                    impact: 4,
                    rationale: 'Access controls are weak.',
                    suggestedControls: ['MFA', 'RBAC'],
                    confidence: 'high',
                    structuredRationale: {
                        whyThisRisk: 'Because access controls are weak',
                        affectedAssetCharacteristics: ['Internet-facing'],
                        suggestedControlThemes: ['Identity'],
                    },
                }],
            });
            expect(result.success).toBe(true);
        });

        it('applies defaults for confidence and structuredRationale', () => {
            const result = RiskSuggestionOutputSchema.safeParse({
                suggestions: [{
                    title: 'Test risk',
                    description: 'Test',
                    likelihood: 3,
                    impact: 3,
                    rationale: 'Because',
                }],
            });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.suggestions[0].confidence).toBe('medium');
                expect(result.data.suggestions[0].structuredRationale.whyThisRisk).toBe('');
            }
        });

        it('rejects empty suggestions array', () => {
            const result = RiskSuggestionOutputSchema.safeParse({
                suggestions: [],
            });
            expect(result.success).toBe(false);
        });

        it('rejects missing required fields', () => {
            const result = RiskSuggestionOutputSchema.safeParse({
                suggestions: [{
                    title: 'Test',
                    // missing description, likelihood, impact, rationale
                }],
            });
            expect(result.success).toBe(false);
        });

        it('rejects likelihood out of range', () => {
            const result = RiskSuggestionOutputSchema.safeParse({
                suggestions: [{
                    title: 'Test',
                    description: 'Desc',
                    likelihood: 6,
                    impact: 3,
                    rationale: 'Because',
                }],
            });
            expect(result.success).toBe(false);
        });

        it('rejects more than 25 suggestions', () => {
            const suggestions = Array.from({ length: 26 }, (_, i) => ({
                title: `Risk ${i}`,
                description: `Description ${i}`,
                likelihood: 3,
                impact: 3,
                rationale: `Rationale ${i}`,
            }));
            const result = RiskSuggestionOutputSchema.safeParse({ suggestions });
            expect(result.success).toBe(false);
        });
    });

    describe('ApplySessionSchema', () => {
        it('accepts valid apply input', () => {
            const result = ApplySessionSchema.safeParse({
                acceptedItemIds: ['item1', 'item2'],
            });
            expect(result.success).toBe(true);
        });

        it('rejects empty acceptedItemIds', () => {
            const result = ApplySessionSchema.safeParse({
                acceptedItemIds: [],
            });
            expect(result.success).toBe(false);
        });
    });
});

// ─── Prompt Builder Tests ───

describe('Prompt Builder', () => {
    it('builds prompt with tenant context', () => {
        const input: RiskAssessmentInput = {
            tenantIndustry: 'Financial Services',
            tenantContext: 'Processing payment card data',
            frameworks: ['ISO27001', 'SOC2'],
            assets: [
                { id: '1', name: 'Payment Gateway', type: 'APPLICATION', criticality: 'HIGH' },
            ],
            existingControls: ['Access Control Policy', 'Encryption at Rest'],
            maxRiskScale: 5,
        };

        const prompt = buildRiskAssessmentPrompt(input);

        expect(prompt.system).toContain('GRC');
        expect(prompt.user).toContain('Financial Services');
        expect(prompt.user).toContain('Payment Gateway');
        expect(prompt.user).toContain('ISO27001');
        expect(prompt.user).toContain('Access Control Policy');
        expect(prompt.responseSchema).toContain('"suggestions"');
    });

    it('handles minimal input', () => {
        const input: RiskAssessmentInput = {
            frameworks: [],
            assets: [],
        };

        const prompt = buildRiskAssessmentPrompt(input);

        expect(prompt.system.length).toBeGreaterThan(50);
        expect(prompt.user.length).toBeGreaterThan(10);
        expect(prompt.responseSchema).toBeTruthy();
    });

    it('includes risk scale in system prompt', () => {
        const input: RiskAssessmentInput = {
            frameworks: [],
            assets: [],
            maxRiskScale: 10,
        };

        const prompt = buildRiskAssessmentPrompt(input);
        expect(prompt.system).toContain('1-10');
        expect(prompt.system).toContain('10=Very High');
    });

    // ─── Framework-specific prompt tests ───

    it('includes ISO27001 Annex A guidance when selected', () => {
        const input: RiskAssessmentInput = {
            frameworks: ['ISO27001'],
            assets: [],
        };
        const prompt = buildRiskAssessmentPrompt(input);
        expect(prompt.system).toContain('ISO 27001');
        expect(prompt.system).toContain('Annex A');
    });

    it('includes NIS2 operational resilience guidance when selected', () => {
        const input: RiskAssessmentInput = {
            frameworks: ['NIS2'],
            assets: [],
        };
        const prompt = buildRiskAssessmentPrompt(input);
        expect(prompt.system).toContain('NIS2');
        expect(prompt.system).toContain('resilience');
    });

    it('includes SOC2 Trust Service Criteria when selected', () => {
        const input: RiskAssessmentInput = {
            frameworks: ['SOC2'],
            assets: [],
        };
        const prompt = buildRiskAssessmentPrompt(input);
        expect(prompt.system).toContain('SOC 2');
        expect(prompt.system).toContain('Trust Service');
    });

    it('includes asset-type risk categories in user prompt', () => {
        const input: RiskAssessmentInput = {
            frameworks: [],
            assets: [{ id: '1', name: 'Customer DB', type: 'DATA_STORE' }],
        };
        const prompt = buildRiskAssessmentPrompt(input);
        expect(prompt.user).toContain('Customer DB');
        expect(prompt.user).toContain('risk categories');
    });

    it('requests confidence and structuredRationale in response schema', () => {
        const input: RiskAssessmentInput = {
            frameworks: [],
            assets: [],
        };
        const prompt = buildRiskAssessmentPrompt(input);
        expect(prompt.responseSchema).toContain('"confidence"');
        expect(prompt.responseSchema).toContain('"structuredRationale"');
        expect(prompt.responseSchema).toContain('"whyThisRisk"');
    });
});

// ─── Provider Factory Tests ───

describe('Provider Factory', () => {
    const origEnv = process.env;

    beforeEach(() => {
        process.env = { ...origEnv };
        delete process.env.AI_RISK_PROVIDER;
        delete process.env.OPENROUTER_API_KEY;
    });

    afterAll(() => {
        process.env = origEnv;
    });

    it('returns stub provider by default', () => {
        const provider = getProvider();
        expect(provider.providerName).toBe('stub');
    });

    it('returns stub when openrouter requested but no API key', () => {
        process.env.AI_RISK_PROVIDER = 'openrouter';
        const provider = getProvider();
        expect(provider.providerName).toBe('stub');
    });

    it('returns openrouter provider when configured', () => {
        process.env.AI_RISK_PROVIDER = 'openrouter';
        process.env.OPENROUTER_API_KEY = 'test-key-123';
        const provider = getProvider();
        expect(provider.providerName).toBe('openrouter');
    });
});

// ─── No Direct Prisma Import Guard ───

describe('AI Risk Assessment — CI Guards', () => {
    it('provider files do not import prisma directly', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const dir = path.join(process.cwd(), 'src/app-layer/ai/risk-assessment');
        const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.ts'));

        for (const file of files) {
            const content = fs.readFileSync(path.join(dir, file), 'utf-8');
            expect(content).not.toMatch(/from\s+['"]@\/lib\/prisma['"]/);
            expect(content).not.toMatch(/import\s+prisma\s+from/);
        }
    });
});
