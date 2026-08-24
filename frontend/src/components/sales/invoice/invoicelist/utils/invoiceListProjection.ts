import type { Invoice } from '../types/invoicelist.types';

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
    const total = amount(row.total_amount ?? row.final_amount);
    const paid = amount(row.paid_amount);
    const pending = amount(row.pending_amount, Math.max(total - paid, 0));

    return {
        id: String(row.invoice_id ?? row.id),
        invoice_number: String(row.invoice_number || row.document_number || ''),
        customer_id: String(row.customer_id || ''),
        customer_name: String(row.customer_name || ''),
        customer_phone: typeof row.customer_phone === 'string' ? row.customer_phone : undefined,
        customer_email: typeof row.customer_email === 'string' ? row.customer_email : undefined,
        invoice_date: String(row.invoice_date || row.document_date || ''),
        due_date: String(row.due_date || ''),
        total_amount: total,
        paid_amount: paid,
        pending_amount: pending,
        payment_status: paymentStatus(row),
        items_count: amount(row.items_count),
        created_at: String(row.created_at || ''),
        updated_at: String(row.updated_at || ''),
    };
}
