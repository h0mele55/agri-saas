/**
 * Shared SoA / applicability CSV builder.
 *
 * The Statement of Applicability and the per-scheme "applicability
 * statement" are the same artefact (requirement → control → evidence
 * rollup), so both the `reports/soa/export.csv` route and the
 * `schemes/:key/applicability.csv` route render the SAME column shape
 * through this one builder. No internal IDs are exposed — control codes
 * and titles only.
 *
 * Columns (stable, documented):
 *   AnnexAKey | Title | Section | Applicable | Justification |
 *   ImplementationStatus | ControlRefs | Owner | Frequency |
 *   EvidenceCount | OpenTasks | LastTestResult
 */
import type { SoAReportDTO } from '@/lib/dto/soa';

export const SOA_CSV_HEADERS = [
    'AnnexAKey',
    'Title',
    'Section',
    'Applicable',
    'Justification',
    'ImplementationStatus',
    'ControlRefs',
    'Owner',
    'Frequency',
    'EvidenceCount',
    'OpenTasks',
    'LastTestResult',
] as const;

/** RFC-4180-ish field escaping: quote when the value contains a comma,
 *  quote, or newline; double embedded quotes. */
export function escapeCSV(value: string | null | undefined): string {
    const s = String(value ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

/** Build the full CSV document (header + one row per requirement) for a
 *  SoA report. CRLF line endings (Excel-friendly), matching the original
 *  export route. */
export function buildSoACsv(report: SoAReportDTO): string {
    const rows = report.entries.map((entry) => {
        const controlRefs = entry.mappedControls
            .map((c) => `${c.code || '—'} ${c.title}`)
            .join('; ');

        const owners = [
            ...new Set(entry.mappedControls.map((c) => c.owner).filter(Boolean)),
        ].join('; ');

        const frequencies = [
            ...new Set(entry.mappedControls.map((c) => c.frequency).filter(Boolean)),
        ].join('; ');

        const applicable =
            entry.applicable === true
                ? 'Yes'
                : entry.applicable === false
                  ? 'No'
                  : 'Unmapped';

        return [
            escapeCSV(entry.requirementCode),
            escapeCSV(entry.requirementTitle),
            escapeCSV(entry.section),
            escapeCSV(applicable),
            escapeCSV(entry.justification),
            escapeCSV(entry.implementationStatus?.replace(/_/g, ' ')),
            escapeCSV(controlRefs),
            escapeCSV(owners),
            escapeCSV(frequencies),
            String(entry.evidenceCount),
            String(entry.openTaskCount),
            escapeCSV(entry.lastTestResult),
        ].join(',');
    });

    return [SOA_CSV_HEADERS.join(','), ...rows].join('\r\n');
}
