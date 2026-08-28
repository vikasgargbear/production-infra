import type { CanonicalDocumentHistoryItem } from '../../../services/api/modules/history/canonicalDocumentHistory.api';

export type HistoryReturnType = 'sales' | 'purchase';

export interface ReturnsHistoryRow {
    id: string;
    return_no: string;
    return_type: HistoryReturnType;
    customer_name?: string;
    supplier_name?: string;
    original_document_no: string;
    return_date: string;
    total_amount: string;
    status: string;
    reason: string;
    created_at?: string;
    items_count: number;
}

const statusLabels: Record<string, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    approved: 'Approved',
    posted: 'Posted',
    cancelled: 'Cancelled',
    canceled: 'Cancelled',
    reversed: 'Reversed',
};

export const normalizeReturnStatus = (value: unknown): { status: string; label: string } => {
    const status = String(value || '').trim().toLowerCase();
    return {
        status: status || 'unknown',
        label: statusLabels[status] || (status ? status.replace(/_/g, ' ').replace(/^./, char => char.toUpperCase()) : 'Unknown'),
    };
};

export function projectReturnHistoryRow(row: CanonicalDocumentHistoryItem): ReturnsHistoryRow {
    if (row.document_kind !== 'sales_return' && row.document_kind !== 'purchase_return') {
        throw new Error('Return history received a non-return canonical document.');
    }
    if (row.total_amount === null) {
        throw new Error('Return history amount is unavailable from the canonical contract.');
    }
    const type: HistoryReturnType = row.document_kind === 'sales_return' ? 'sales' : 'purchase';
    return {
        id: row.document_id,
        return_no: row.document_number,
        return_type: type,
        customer_name: type === 'sales' ? row.party_name : undefined,
        supplier_name: type === 'purchase' ? row.party_name : undefined,
        original_document_no: row.source_document_number ?? 'Unavailable',
        return_date: row.document_date,
        total_amount: row.total_amount,
        status: normalizeReturnStatus(row.status).status,
        reason: 'Unavailable',
        created_at: row.created_at,
        items_count: row.line_count,
    };
}

export function returnsHistoryCsv(rows: ReturnsHistoryRow[]): string {
    const escape = (value: unknown) => {
        let text = String(value ?? '');
        if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
    };
    const values = [
        ['Return #', 'Date', 'Type', 'Party', 'Original Document', 'Amount', 'Status'],
        ...rows.map(item => [
            item.return_no,
            item.return_date,
            item.return_type,
            item.customer_name || item.supplier_name || '',
            item.original_document_no,
            item.total_amount,
            normalizeReturnStatus(item.status).label,
        ]),
    ];
    return values.map(row => row.map(escape).join(',')).join('\n');
}
