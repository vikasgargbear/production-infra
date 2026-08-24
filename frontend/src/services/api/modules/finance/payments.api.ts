/**
 * Payments API Module
 * Handles payment operations
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';

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
