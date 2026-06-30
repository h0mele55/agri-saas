/**
 * PDFKit Document Factory
 *
 * Creates pre-configured PDFKit documents with consistent margins,
 * metadata, and brand colors.
 */
import PDFDocument from 'pdfkit';
import type { ReportMeta } from './types';

// ─── Brand Tokens ───

export const BRAND = {
    navy:       '#0f172a',
    purple:     '#7c3aed',
    slate:      '#64748b',
    slateLight: '#94a3b8',
    white:      '#ffffff',
    lightGray:  '#f1f5f9',
    medGray:    '#e2e8f0',
    red:        '#ef4444',
    amber:      '#f59e0b',
    green:      '#22c55e',
} as const;

// ─── Margins ───

export const MARGINS = {
    top: 60,
    bottom: 50,
    left: 50,
    right: 50,
} as const;

export const PAGE_WIDTH = 595.28;    // A4 portrait width (pt)
export const PAGE_HEIGHT = 841.89;   // A4 portrait height (pt)
export const CONTENT_WIDTH = PAGE_WIDTH - MARGINS.left - MARGINS.right;

/**
 * Create a new PDFKit document with branding defaults.
 */
export function createPdfDocument(meta: ReportMeta): PDFKit.PDFDocument {
    const doc = new PDFDocument({
        size: 'A4',
        margins: { ...MARGINS },
        bufferPages: true,  // enables page counting for footers
        info: {
            Title: meta.reportTitle,
            Author: meta.tenantName,
            Subject: meta.reportSubtitle || meta.reportTitle,
            Creator: 'Agrent',
            Producer: 'PDFKit',
            CreationDate: new Date(meta.generatedAt),
        },
    });

    return doc;
}
