/**
 * Payments API Module
 * Handles payment operations
 */

import { apiHelpers } from '../../apiClient';
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

function paymentIdempotencyKey(operation: string): string {
    const random = globalThis.crypto?.randomUUID?.()
        || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    return `${operation}_${random}`;
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

    create: (data: PaymentData): Promise<AxiosResponse> => {
        return apiHelpers.post('/payments', data, {
            headers: {
                'X-Idempotency-Key': paymentIdempotencyKey('payment_create')
            }
        });
    },

    // Compatibility shim for older sync paths. The backend currently has no
    // canonical payment update route, so this preserves the existing caller contract.
    update: (paymentId: number | string, data: Partial<PaymentData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`/payments/${paymentId}`, data);
    },

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

    // The backend does not currently expose an unreconciled-transactions read endpoint.
    // Keep the caller contract stable by returning an empty list until that route exists.
    getUnreconciledTransactions: (params: { date?: string; bank_account?: string } = {}): Promise<AxiosResponse> => {
        return Promise.resolve({
            data: [],
            status: 200,
            statusText: 'OK',
            headers: {},
            config: { params }
        } as AxiosResponse);
    },

    // Start bank reconciliation
    startBankReconciliation: (data: BankReconciliationData): Promise<AxiosResponse> => {
        return apiHelpers.post('/payments/bank-reconciliation', {
            bank_account: data.bank_account,
            statement_date: data.statement_date || data.reconciliation_date,
            opening_balance: data.opening_balance ?? data.book_balance ?? 0,
            closing_balance: data.closing_balance ?? data.bank_statement_balance ?? 0,
            transactions: data.transactions || []
        });
    }
};

export async function submitCustomerPayment(
    customerId: number | string,
    data: CustomerPaymentData
): Promise<SubmittedCustomerPayment> {
    const response = await apiHelpers.post(`/customers/${customerId}/payment`, data);
    const paymentResult = response.data?.data || response.data || {};

    return {
        paymentId: paymentResult.payment_id,
        paymentReference: paymentResult.payment_reference || paymentResult.reference_number || data.reference_number,
        raw: paymentResult
    };
}
