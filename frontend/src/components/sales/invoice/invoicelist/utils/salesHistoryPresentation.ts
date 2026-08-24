import type { Invoice, SalesHistoryDocumentType } from '../types/invoicelist.types';

const labels: Record<SalesHistoryDocumentType, string> = {
    invoice: 'Invoice',
    sales_order: 'Sales Order',
    challan: 'Delivery Challan',
};

export const salesDocumentLabel = (type: SalesHistoryDocumentType): string => labels[type];

export const salesDocumentNumberLabel = (type: SalesHistoryDocumentType): string => {
    if (type === 'sales_order') return 'Order #';
    if (type === 'challan') return 'Challan #';
    return 'Invoice #';
};

export const salesDocumentStatus = (document: Invoice): string =>
    document.document_type === 'invoice'
        ? document.payment_status
        : document.document_status;

export const salesStatusLabel = (status: string): string => {
    const normalized = status.trim().toLowerCase();
    const known: Record<string, string> = {
        paid: 'Paid',
        partial: 'Partially Paid',
        partially_paid: 'Partially Paid',
        pending: 'Pending',
        overdue: 'Overdue',
        draft: 'Draft',
        approved: 'Approved',
        posted: 'Posted',
        dispatched: 'Dispatched',
        partially_dispatched: 'Partially Dispatched',
        delivered: 'Delivered',
        fulfilled: 'Fulfilled',
        completed: 'Completed',
        closed: 'Closed',
        cancelled: 'Cancelled',
        reversed: 'Reversed',
    };
    if (known[normalized]) return known[normalized];
    return normalized
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ') || 'Unknown';
};

export const salesStatusTone = (
    status: string,
): 'success' | 'warning' | 'info' | 'error' | 'default' => {
    const normalized = status.toLowerCase();
    if (['paid', 'approved', 'posted', 'dispatched', 'delivered', 'fulfilled', 'completed', 'closed'].includes(normalized)) {
        return 'success';
    }
    if (['partial', 'partially_paid', 'partially_dispatched', 'overdue'].includes(normalized)) {
        return 'warning';
    }
    if (['cancelled', 'reversed'].includes(normalized)) return 'error';
    if (['pending', 'draft'].includes(normalized)) return 'info';
    return 'default';
};

const csvCell = (value: unknown): string => {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
};

const exportPrefix: Record<SalesHistoryDocumentType, string> = {
    invoice: 'invoices',
    sales_order: 'sales-orders',
    challan: 'delivery-challans',
};

export const salesHistoryExportFilename = (
    type: SalesHistoryDocumentType,
    date: string,
    selected = false,
): string => `${exportPrefix[type]}-${selected ? 'selected' : 'export'}-${date}.csv`;

export const salesHistoryListCsv = (
    type: SalesHistoryDocumentType,
    documents: Invoice[],
): string => {
    const rows: unknown[][] = type === 'invoice'
        ? [
            ['Invoice Number', 'Customer', 'Invoice Date', 'Due Date', 'Total Amount', 'Paid Amount', 'Outstanding Amount', 'Payment Status'],
            ...documents.map(document => [
                document.invoice_number,
                document.customer_name,
                document.invoice_date,
                document.due_date,
                document.total_amount.toFixed(2),
                document.paid_amount.toFixed(2),
                document.pending_amount.toFixed(2),
                salesStatusLabel(document.payment_status),
            ]),
        ]
        : type === 'sales_order'
            ? [
                ['Sales Order Number', 'Customer', 'Order Date', 'Expected Delivery', 'Amount', 'Order Status'],
                ...documents.map(document => [
                    document.invoice_number,
                    document.customer_name,
                    document.invoice_date,
                    document.due_date,
                    document.total_amount.toFixed(2),
                    salesStatusLabel(document.document_status),
                ]),
            ]
            : [
                ['Delivery Challan Number', 'Customer', 'Challan Date', 'Dispatch Date', 'Amount', 'Challan Status'],
                ...documents.map(document => [
                    document.invoice_number,
                    document.customer_name,
                    document.invoice_date,
                    document.due_date,
                    document.total_amount.toFixed(2),
                    salesStatusLabel(document.document_status),
                ]),
            ];

    return `${rows.map(row => row.map(csvCell).join(',')).join('\n')}\n`;
};

export const salesHistoryDocumentCsv = (document: Invoice): string => {
    const headers = ['Document Type', 'Document Number', 'Date', 'Customer', 'Amount', 'Status'];
    const values = [
        salesDocumentLabel(document.document_type),
        document.invoice_number,
        document.invoice_date,
        document.customer_name,
        document.total_amount.toFixed(2),
        salesStatusLabel(salesDocumentStatus(document)),
    ];
    return `${headers.map(csvCell).join(',')}\n${values.map(csvCell).join(',')}\n`;
};

const escapeHtml = (value: unknown): string => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export const salesHistoryPrintHtml = (document: Invoice): string => {
    const type = salesDocumentLabel(document.document_type);
    const status = salesStatusLabel(salesDocumentStatus(document));
    return `<!doctype html><html><head><title>${escapeHtml(type)} ${escapeHtml(document.invoice_number)}</title>`
        + '<style>body{font:14px system-ui,sans-serif;color:#111827;padding:32px}h1{font-size:22px}'
        + 'dl{display:grid;grid-template-columns:160px 1fr;max-width:640px;border-top:1px solid #d1d5db}'
        + 'dt,dd{margin:0;padding:10px;border-bottom:1px solid #d1d5db}dt{color:#4b5563}</style></head><body>'
        + `<h1>${escapeHtml(type)} ${escapeHtml(document.invoice_number)}</h1><dl>`
        + `<dt>Date</dt><dd>${escapeHtml(document.invoice_date)}</dd>`
        + `<dt>Customer</dt><dd>${escapeHtml(document.customer_name)}</dd>`
        + `<dt>Amount</dt><dd>₹${escapeHtml(document.total_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 }))}</dd>`
        + `<dt>Status</dt><dd>${escapeHtml(status)}</dd></dl></body></html>`;
};
