import type { Invoice, SalesHistoryDocumentType } from '../types/invoicelist.types';

const amount = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const paymentStatus = (row: any): Invoice['payment_status'] => {
    const status = String(row.payment_status || row.status || 'pending').toLowerCase();
    if (status === 'paid') return 'paid';
    if (status === 'partial' || status === 'partially_paid') return 'partial';
    if (status === 'overdue') return 'overdue';
    if (status === 'cancelled' || status === 'reversed') return 'cancelled';
    // A canonical posted invoice is an issued document, not proof of payment.
    return 'pending';
};

export function projectInvoiceListRow(row: any): Invoice {
    return projectSalesHistoryRow(row, 'invoice');
}

const canonicalDocumentStatus = (row: any): string =>
    String(row.document_status || row.invoice_status || row.order_status
        || row.challan_status || row.delivery_status || row.status || 'pending').toLowerCase();

export function projectSalesHistoryRow(
    row: any,
    documentType: SalesHistoryDocumentType,
): Invoice {
    const total = amount(row.total_amount ?? row.final_amount);
    const paid = amount(row.paid_amount);
    const pending = amount(row.pending_amount, Math.max(total - paid, 0));
    const id = row.invoice_id ?? row.order_id ?? row.challan_id ?? row.document_id ?? row.id;
    const number = row.invoice_number ?? row.order_number ?? row.challan_number
        ?? row.document_number ?? '';
    const documentDate = row.invoice_date ?? row.order_date ?? row.challan_date
        ?? row.dispatch_date ?? row.document_date ?? '';
    const dueDate = documentType === 'sales_order'
        ? row.requested_delivery_date ?? row.delivery_date
        : documentType === 'challan'
            ? row.dispatch_date
            : row.due_date;

    return {
        id: String(id || ''),
        document_type: documentType,
        document_status: canonicalDocumentStatus(row),
        invoice_number: String(number),
        customer_id: String(row.customer_id || ''),
        customer_name: String(row.customer_name || ''),
        customer_phone: typeof row.customer_phone === 'string' ? row.customer_phone : undefined,
        customer_email: typeof row.customer_email === 'string' ? row.customer_email : undefined,
        invoice_date: String(documentDate),
        due_date: String(dueDate || ''),
        total_amount: total,
        paid_amount: documentType === 'invoice' ? paid : 0,
        pending_amount: documentType === 'invoice' ? pending : 0,
        payment_status: documentType === 'invoice' ? paymentStatus(row) : 'pending',
        items_count: amount(row.items_count, Array.isArray(row.items) ? row.items.length : 0),
        created_at: String(row.created_at || ''),
        updated_at: String(row.updated_at || ''),
    };
}
