/**
 * Swappable AI provider — factory.
 *
 * `getAiProvider()` reads the AI_* env contract (via src/env.ts — never
 * raw process.env) and returns ONE OpenAiCompatibleProvider configured
 * for the chosen backend. Local dev defaults to Ollama (qwen3:1.7b at
 * http://localhost:11434/v1, key 'ollama') so it runs with zero config
 * at zero API cost; prod swaps the backend purely by setting AI_BASE_URL
 * / AI_API_KEY / AI_MODEL (+ optional AI_BACKEND).
 *
 * Backend inference: when AI_BACKEND is the default 'ollama' but the base
 * URL points elsewhere (openrouter.ai / groq / together), the backend is
 * inferred from the host so the capability map matches the real backend.
 */
import { env } from '@/env';
import { OpenAiCompatibleProvider } from './openai-compatible-provider';
import type { AiBackend, AiProvider } from './types';

/** Infer the backend from a base-URL host when not set explicitly. */
export function inferBackend(baseURL: string): AiBackend {
    let host: string;
    try {
        host = new URL(baseURL).host.toLowerCase();
    } catch {
        return 'openai-compatible';
    }
    if (host.includes('openrouter.ai')) return 'openrouter';
    if (host.includes('groq.com')) return 'groq';
    if (host.includes('together.ai') || host.includes('together.xyz')) return 'together';
    if (host.includes('localhost') || host.includes('127.0.0.1') || host.includes('ollama')) return 'ollama';
    return 'openai-compatible';
}

/**
 * Resolve the configured backend. An explicitly-set AI_BACKEND (anything
 * other than the schema default 'ollama') wins; otherwise infer from the
 * base URL so a hosted base URL with the default backend still maps right.
 */
function resolveBackend(): AiBackend {
    const explicit = env.AI_BACKEND;
    const inferred = inferBackend(env.AI_BASE_URL);
    // 'ollama' is the schema default — treat it as "unset" so a hosted
    // AI_BASE_URL is honoured. Any other explicit value is respected.
    if (explicit !== 'ollama') {
        // 'openai-compatible' is a deliberate generic choice — prefer a
        // sharper inference when the host is recognisable.
        if (explicit === 'openai-compatible' && inferred !== 'openai-compatible') return inferred;
        return explicit;
    }
    return inferred;
}

/** Build the configured OpenAI-compatible provider from env. */
export function getAiProvider(): AiProvider {
    return new OpenAiCompatibleProvider({
        backend: resolveBackend(),
        baseURL: env.AI_BASE_URL,
        apiKey: env.AI_API_KEY,
        model: env.AI_MODEL,
    });
}

export { OpenAiCompatibleProvider, CAPABILITIES, AiProviderError } from './openai-compatible-provider';
export type {
    AiBackend,
    AiCapabilities,
    AiProvider,
    AiMessage,
    AiRole,
    AiToolDef,
    AiToolCall,
    AiCompleteOptions,
    AiCompletion,
    AiHealth,
    OpenAiCompatibleConfig,
} from './types';
