/**
 * Export a DOM card to a crisp PNG and offer save/share
 * (feat/delight-shareables). Reuses html-to-image (already a dependency, see
 * canvas-export.ts). Tries the native Web Share sheet with the image file
 * first (mobile — "save to Photos / send to WhatsApp"); falls back to a
 * download on desktop. Best-effort: returns false if capture/share failed so
 * the caller can surface a toast.
 */
import { toPng } from 'html-to-image';

function safeFilename(label: string): string {
    const stem = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    return `${stem || 'card'}.png`;
}

interface ShareCapableNavigator extends Navigator {
    canShare?: (data?: ShareData) => boolean;
}

export type ShareCardResult = 'shared' | 'downloaded' | 'failed';

/** Render `el` to a 2× PNG, then share (mobile) or download (desktop). */
export async function exportShareCard(el: HTMLElement, label: string): Promise<ShareCardResult> {
    try {
        const dataUrl = await toPng(el, {
            pixelRatio: 2, // retina-crisp
            cacheBust: true,
        });
        const fileName = safeFilename(label);
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], fileName, { type: 'image/png' });

        const nav = typeof navigator !== 'undefined' ? (navigator as ShareCapableNavigator) : null;
        if (nav?.share && nav.canShare?.({ files: [file] })) {
            await nav.share({ files: [file], title: label });
            return 'shared';
        }

        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        return 'downloaded';
    } catch {
        return 'failed';
    }
}
