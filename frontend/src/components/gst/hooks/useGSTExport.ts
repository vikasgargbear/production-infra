/** Deterministic CSV export of the exact facts already accepted by a GST view. */

import { useCallback } from 'react';

interface ExportOptions {
    filename?: string;
    reportType?: string;
}

interface UseGSTExportResult {
    exportToCSV: (data: unknown, options?: ExportOptions) => void;
}

const csvCell = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('GST export contains an unsupported value.');
    }
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const tableFor = (data: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') throw new Error('GST export data is unavailable.');
    const payload = data as Record<string, unknown>;
    if (Array.isArray(payload.b2b)) return payload.b2b as Array<Record<string, unknown>>;
    if (Array.isArray(payload.hsn_summary)) return payload.hsn_summary as Array<Record<string, unknown>>;
    throw new Error('This GST report has no canonical tabular export.');
};

export function useGSTExport(): UseGSTExportResult {
    const exportToCSV = useCallback((data: unknown, options: ExportOptions = {}) => {
        const rows = tableFor(data);
        if (rows.length === 0) throw new Error('This GST report has no rows to export.');
        const headers = Object.keys(rows[0]).filter(header => header !== 'row_key');
        if (headers.length === 0 || rows.some(row => headers.some(header => !(header in row)))) {
            throw new Error('GST export rows do not share one canonical schema.');
        }
        const csv = [
            headers.map(csvCell).join(','),
            ...rows.map(row => headers.map(header => csvCell(row[header])).join(',')),
        ].join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${options.filename || options.reportType || 'gst_report'}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }, []);

    return { exportToCSV };
}

export default useGSTExport;
