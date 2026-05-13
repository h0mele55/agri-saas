import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { Providers } from './providers';
import { CSP_NONCE_HEADER } from '@/lib/security/csp';
import './globals.css';

export const metadata: Metadata = {
    title: 'Inflect Compliance — Платформа за съответствие по ISO 27001',
    description: 'Цялостно управление на съответствието по ISO 27001:2022 с карти на SOC 2 и NIS2.',
};

/**
 * R11-PR9 — explicit viewport metadata. Next.js no longer emits a
 * default viewport meta starting in 14.x, so any layout that wants
 * sane mobile rendering must declare it. Locked here at the root so
 * every page inherits the same width=device-width + initial-scale=1
 * baseline. `maximumScale: 5` keeps user-pinch-zoom intact (an
 * accessibility requirement — never set 1 unless the design has
 * truly tested at every viewport).
 */
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 5,
    viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
    const locale = await getLocale();
    const messages = await getMessages();
    const nonce = (await headers()).get(CSP_NONCE_HEADER) ?? undefined;

    return (
        // `data-theme="dark"` seeds the SSR markup so the first paint matches
        // the baseline palette. ThemeProvider rehydrates from localStorage /
        // prefers-color-scheme on the client and flips the attribute if needed.
        <html lang={locale} data-theme="dark" suppressHydrationWarning>
            <head>
                {/*
                    2026-05-14 — CSP `strict-dynamic` + webpack chunk
                    loader bridge. Next.js auto-applies the request
                    nonce to its server-rendered `<script>` and
                    `<link>` tags, but DYNAMICALLY-loaded webpack
                    chunks (Next's `chunks/*.js` for code-split
                    components like the R16 visx/motion charts) are
                    injected at runtime via `document.createElement
                    ('script')`. Those don't inherit the nonce
                    automatically — they need webpack to set
                    `script.nonce` at injection time, which webpack
                    does only when `__webpack_nonce__` is defined.
                    Setting it on `window` (and `globalThis` for
                    completeness in stricter runtimes) BEFORE any
                    chunk loads kicks in is what unblocks
                    strict-dynamic for the chart code.

                    The script itself carries the nonce so CSP
                    allows it. Inline content is deterministic
                    (just `var __webpack_nonce__ = '<nonce>';`),
                    no user input — no XSS surface beyond the
                    nonce itself (which is per-request +
                    cryptographically random).
                */}
                {nonce && (
                    <script
                        nonce={nonce}
                        dangerouslySetInnerHTML={{
                            __html: `window.__webpack_nonce__=${JSON.stringify(nonce)};globalThis.__webpack_nonce__=${JSON.stringify(nonce)};`,
                        }}
                    />
                )}
            </head>
            <body suppressHydrationWarning nonce={nonce}>
                <Providers>
                    <NextIntlClientProvider messages={messages} locale={locale}>
                        {children}
                    </NextIntlClientProvider>
                </Providers>
            </body>
        </html>
    );
}
