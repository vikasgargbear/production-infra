/**
 * Payments API Module
 * Handles payment operations
 */

import { apiHelpers } from '../../apiClient';
import { createCrudApi } from '../../utils/createCrudApi';
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

// ============================================
// API Module
// ============================================

const crud = createCrudApi({ basePath: '/payments', useCleanData: false });

export const paymentsApi = {
    ...crud,

    // Get receipts (customer payments)
    getReceipts: (params: PaymentParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get('/payments/receipts', { params });
    },

    // Get payments (supplier payments)
    getPayments: (params: PaymentParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get('/payments/payments', { params });
    },

    // Get payment modes
    getModes: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/payments/modes');
    },

    // Get pending payments
    getPending: (params: PaymentParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get('/payments/pending', { params });
    },

    // Allocate payment to invoices
    allocate: (paymentId: number, allocations: PaymentAllocation[]): Promise<AxiosResponse> => {
        return apiHelpers.post(`/payments/allocate/${paymentId}`, { allocations });
    },

    // Print receipt
    printReceipt: (paymentId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`/payments/${paymentId}/print`, { responseType: 'blob' });
    },

    // Get outstanding invoices for a party
    getOutstandingInvoices: (partyId: number, partyType: 'customer' | 'supplier' = 'customer'): Promise<AxiosResponse> => {
        return apiHelpers.get('/payments/outstanding', { params: { customer_id: partyId } });
    },

    // Get unreconciled transactions for bank reconciliation
    getUnreconciledTransactions: (params: { date?: string; bank_account?: string } = {}): Promise<AxiosResponse> => {
        return apiHelpers.get('/payments/unreconciled', { params });
    },

    // Start bank reconciliation
    startBankReconciliation: (data: {
        bank_account: string;
        reconciliation_date: string;
        bank_statement_balance: number;
        book_balance: number;
    }): Promise<AxiosResponse> => {
        return apiHelpers.post('/payments/reconcile', data);
    }
};
