'use client';

/**
 * Recovers from `ChunkLoadError` by reloading the page once.
 *
 * A code-split chunk (`/_next/static/chunks/*.js`) can intermittently
 * fail to load — a transient network blip, a CDN/server hiccup serving a
 * lazy chunk, or a client holding a tab open across a deploy that rotated
 * the chunk hashes. Webpack surfaces this as an uncaught `ChunkLoadError`
 * and the dynamically-imported component never mounts, leaving the page
 * stuck.
 *
 * The fix users (and the E2E suite) actually want is the obvious one:
 * fetch the chunks fresh. We listen for the error globally and trigger a
 * single `location.reload()`. A short time-window guard (kept in
 * `sessionStorage`) prevents a reload loop when a chunk is *genuinely*
 * missing — we reload at most once per window, then surface the error.
 *
 * Renders nothing.
 */
import { useEffect } from 'react';

const RELOAD_TS_KEY = 'chunk-reload-ts';
const RELOAD_COOLDOWN_MS = 10_000;

function isChunkLoadError(reason: unknown): boolean {
    const name = reason instanceof Error ? reason.name : '';
    const message =
        reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : '';
    return (
        name === 'ChunkLoadError' ||
        /Loading chunk [\w-]+ failed/i.test(message) ||
        /Loading CSS chunk [\w-]+ failed/i.test(message) ||
        /ChunkLoadError/i.test(message)
    );
}

export function ChunkReloadHandler() {
    useEffect(() => {
        const recover = (reason: unknown) => {
            if (!isChunkLoadError(reason)) return;
            let last = 0;
            try {
                last = Number(sessionStorage.getItem(RELOAD_TS_KEY) ?? 0);
            } catch {
                /* sessionStorage unavailable (private mode) — fall through */
            }
            const now = Date.now();
            // Already reloaded within the cooldown → the chunk is genuinely
            // unavailable; stop, don't loop.
            if (now - last < RELOAD_COOLDOWN_MS) return;
            try {
                sessionStorage.setItem(RELOAD_TS_KEY, String(now));
            } catch {
                /* ignore */
            }
            window.location.reload();
        };

        const onError = (e: ErrorEvent) => recover(e.error ?? e.message);
        const onRejection = (e: PromiseRejectionEvent) => recover(e.reason);

        window.addEventListener('error', onError);
        window.addEventListener('unhandledrejection', onRejection);
        return () => {
            window.removeEventListener('error', onError);
            window.removeEventListener('unhandledrejection', onRejection);
        };
    }, []);

    return null;
}

export default ChunkReloadHandler;
