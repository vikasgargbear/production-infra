import { normalizeAuthoritativeDecimal } from '../../../utils/exactDecimal';

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

export function projectReturnsHistoryRows(value: unknown, type: HistoryReturnType): ReturnsHistoryRow[] {
    if (!Array.isArray(value)) return [];
    return value.map((raw) => {
        const row = (raw || {}) as Record<string, unknown>;
        const id = row.return_id ?? row.id;
        const returnNumber = row.return_number ?? row.return_no
            ?? (type === 'sales' ? row.sales_return_no : row.purchase_return_no);
        return {
            id: String(id ?? ''),
            return_no: String(returnNumber ?? 'Not assigned'),
            return_type: type,
            customer_name: type === 'sales'
                ? String(row.party_name ?? row.customer_name ?? 'Unknown Customer')
                : undefined,
            supplier_name: type === 'purchase'
                ? String(row.party_name ?? row.supplier_name ?? 'Unknown Supplier')
                : undefined,
            original_document_no: String(
                row.original_document_no ?? row.original_invoice_number
                ?? row.original_purchase_no ?? row.invoice_number ?? row.purchase_no ?? 'Not available',
            ),
            return_date: String(row.return_date ?? ''),
            total_amount: normalizeAuthoritativeDecimal(row.total_amount, 'Return history amount', {
                scale: 2, maximumWholeDigits: 20, allowNegative: true,
            }),
            status: normalizeReturnStatus(row.approval_status ?? row.status).status,
            reason: String(row.return_reason ?? row.reason ?? 'Not available'),
            created_at: row.created_at ? String(row.created_at) : undefined,
            items_count: typeof row.items_count === 'number' && Number.isSafeInteger(row.items_count) && row.items_count >= 0
                ? row.items_count
                : (Array.isArray(row.items) ? row.items.length : 0),
        };
    });
}

export function returnsHistoryCsv(rows: ReturnsHistoryRow[]): string {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
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
