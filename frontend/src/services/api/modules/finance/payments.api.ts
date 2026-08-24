/**
 * Payments API Module
 * Handles payment operations
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';
import { normalizeAuthoritativeDecimal } from '../../../../utils/exactDecimal';

// ============================================
// Type Definitions
// ============================================

export interface PaymentParams {
    party_type?: 'customer' | 'supplier';
    payment_type?: 'receipt' | 'payment';
    from_date?: string;
    to_date?: string;
    status?: string;
    limit?: number;
    offset?: number;
}

export type CanonicalPaymentDirection = 'received' | 'made';

export interface CanonicalPaymentHistoryParams {
    direction?: 'all' | CanonicalPaymentDirection;
    date_from?: string;
    date_to?: string;
    search?: string;
    page?: number;
    page_size?: number;
}

export interface CanonicalPaymentHistoryItem {
    payment_id: string;
    command_request_id: string;
    payment_number: string;
    payment_date: string;
    branch_id: string;
    party_id: string;
    party_name: string;
    direction: CanonicalPaymentDirection;
    payment_method: 'bank_transfer' | 'card' | 'upi';
    external_reference?: string | null;
    amount: string;
    allocated_amount: string;
    allocation_count: number;
    journal_entry_id: string;
    journal_number: string;
    journal_debit_total: string;
    journal_credit_total: string;
    allocation_reconciled: true;
    journal_balanced: true;
    open_item_residuals_reconciled: true;
    status: 'posted';
}

export interface CanonicalPaymentHistoryResponse {
    items: CanonicalPaymentHistoryItem[];
    page: number;
    page_size: number;
    total: number;
}

export interface CanonicalPaymentDetail extends CanonicalPaymentHistoryItem {
    allocations: Array<{
        allocation_id: string;
        open_item_id: string;
        source_document_id: string;
        source_document_number: string;
        source_document_type: 'sales_invoice' | 'supplier_invoice';
        allocation_date: string;
        amount: string;
        principal_amount: string;
        effective_allocated_amount: string;
        residual_amount: string;
    }>;
    journal_lines: Array<{
        journal_line_id: string;
        line_number: number;
        account_id: string;
        party_id?: string | null;
        debit: string;
        credit: string;
    }>;
}

const exactMoney = (value: unknown, label: string) => normalizeAuthoritativeDecimal(
    value, label, { scale: 2, maximumWholeDigits: 20, allowNegative: false },
);

function normalizeHistoryItem(item: CanonicalPaymentHistoryItem): CanonicalPaymentHistoryItem {
    return {
        ...item,
        amount: exactMoney(item.amount, 'Payment amount'),
        allocated_amount: exactMoney(item.allocated_amount, 'Allocated amount'),
        journal_debit_total: exactMoney(item.journal_debit_total, 'Journal debit total'),
        journal_credit_total: exactMoney(item.journal_credit_total, 'Journal credit total'),
    };
}

function normalizePaymentDetail(detail: CanonicalPaymentDetail): CanonicalPaymentDetail {
    return {
        ...normalizeHistoryItem(detail),
        allocations: detail.allocations.map((row) => ({
            ...row,
            amount: exactMoney(row.amount, 'Allocation amount'),
            principal_amount: exactMoney(row.principal_amount, 'Open-item principal'),
            effective_allocated_amount: exactMoney(row.effective_allocated_amount, 'Effective allocation'),
            residual_amount: exactMoney(row.residual_amount, 'Open-item residual'),
        })),
        journal_lines: detail.journal_lines.map((row) => ({
            ...row,
            debit: exactMoney(row.debit, 'Journal debit'),
            credit: exactMoney(row.credit, 'Journal credit'),
        })),
    };
}

export interface PaymentData {
    party_id: number;
    party_type: 'customer' | 'supplier';
    payment_type: 'receipt' | 'payment';
    amount: number;
    payment_mode: string;
    payment_date?: string;
    reference_number?: string;
    bank_account_id?: number;
    notes?: string;
    allocations?: PaymentAllocation[];
}

export interface PaymentAllocation {
    invoice_id: number;
    amount: number;
    allocated_amount?: number;
}

export interface CustomerPaymentData {
    customer_id: number;
    payment_date: string;
    amount: number;
    payment_mode: string;
    reference_number?: string;
    bank_name?: string;
    notes?: string;
    allocate_to_invoices?: number[];
}

export interface SubmittedCustomerPayment {
    paymentId?: number;
    paymentReference?: string;
    raw: any;
}

export interface BankReconciliationData {
    bank_account: string;
    statement_date?: string;
    reconciliation_date?: string;
    opening_balance?: number;
    book_balance?: number;
    closing_balance?: number;
    bank_statement_balance?: number;
    transactions?: Array<{
        date: string;
        description?: string;
        amount: number;
    }>;
}

// ============================================
// API Module
// ============================================

export const paymentsApi = {
    getCanonicalHistory: async (
        params: CanonicalPaymentHistoryParams = {},
    ): Promise<AxiosResponse<CanonicalPaymentHistoryResponse>> => {
        const response = await apiHelpers.get<CanonicalPaymentHistoryResponse>(
            '/canonical/payment-history', { params },
        );
        return {
            ...response,
            data: {
                ...response.data,
                items: response.data.items.map(normalizeHistoryItem),
            },
        };
    },

    getCanonicalDetail: async (
        paymentId: string,
    ): Promise<AxiosResponse<CanonicalPaymentDetail>> => {
        const response = await apiHelpers.get<CanonicalPaymentDetail>(
            `/canonical/payment-history/${paymentId}`,
        );
        return { ...response, data: normalizePaymentDetail(response.data) };
    },

    getOverview: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/payments');
    },

    getAll: (params: PaymentParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get('/payments/search', { params });
    },

    getById: (paymentId: number | string): Promise<AxiosResponse> => {
        return apiHelpers.get(`/payments/${paymentId}`);
    },

    create: (_data: PaymentData): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Posting a payment'),

    update: (_paymentId: number | string, _data: Partial<PaymentData>): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Editing a payment'),

    // Get receipts (customer payments)
    getReceipts: (params: PaymentParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get('/payments/search', {
            params: { ...params, payment_type: 'receipt' }
        });
    },

    // Get payments (supplier payments)
    getPayments: (params: PaymentParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get('/payments/search', {
            params: { ...params, payment_type: 'payment' }
        });
    },

    // Get payment modes
    getModes: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/payments/methods');
    },

    // Get pending payments
    getPending: (params: PaymentParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get('/payments/pending', { params });
    },

    // No dedicated print endpoint exists; callers can fetch the receipt payload by ID.
    printReceipt: (paymentId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`/payments/${paymentId}`);
    },

    // Get outstanding invoices for a party
    getOutstandingInvoices: (partyId: number, partyType: 'customer' | 'supplier' = 'customer'): Promise<AxiosResponse> => {
        return apiHelpers.get('/payments/outstanding', {
            params: partyType === 'customer' ? { customer_id: partyId } : {}
        });
    },

    getUnreconciledTransactions: (_params: { date?: string; bank_account?: string } = {}): Promise<AxiosResponse> =>
        Promise.reject(new Error('The canonical unreconciled-transactions query is not available.')),

    // Start bank reconciliation
    startBankReconciliation: (_data: BankReconciliationData): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Starting bank reconciliation')
};

export async function submitCustomerPayment(
    _customerId: number | string,
    _data: CustomerPaymentData
): Promise<SubmittedCustomerPayment> {
    return rejectCanonicalWrite('Posting a customer payment');
}
