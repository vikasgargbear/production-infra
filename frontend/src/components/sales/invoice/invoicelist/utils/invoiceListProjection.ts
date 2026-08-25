import type { Invoice, SalesHistoryDocumentType } from '../types/invoicelist.types';
import type { CanonicalDocumentHistoryItem } from '../../../../../services/api/modules/history/canonicalDocumentHistory.api';

const paymentStatus = (row: CanonicalDocumentHistoryItem): Invoice['payment_status'] => {
    const status = String(row.payment_status || row.status || 'pending').toLowerCase();
    if (status === 'paid') return 'paid';
    if (status === 'partial' || status === 'partially_paid') return 'partial';
    if (status === 'overdue') return 'overdue';
    if (status === 'cancelled' || status === 'reversed') return 'cancelled';
    // A canonical posted invoice is an issued document, not proof of payment.
    return 'pending';
};

export function projectInvoiceListRow(row: CanonicalDocumentHistoryItem): Invoice {
    return projectSalesHistoryRow(row, 'invoice');
}

const canonicalDocumentStatus = (row: CanonicalDocumentHistoryItem): string =>
    row.status.toLowerCase();

export function projectSalesHistoryRow(
    row: CanonicalDocumentHistoryItem,
    documentType: SalesHistoryDocumentType,
): Invoice {
    return {
        id: row.document_id,
        document_type: documentType,
        document_status: canonicalDocumentStatus(row),
        invoice_number: row.document_number,
        customer_id: row.party_account_id,
        customer_name: row.party_name,
        invoice_date: row.document_date,
        due_date: row.due_date || '',
        total_amount: row.total_amount,
        paid_amount: documentType === 'invoice' ? row.paid_amount : null,
        pending_amount: documentType === 'invoice' ? row.outstanding_amount : null,
        payment_status: documentType === 'invoice' ? paymentStatus(row) : null,
        items_count: row.line_count,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
