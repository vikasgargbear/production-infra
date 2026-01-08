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
    allocated_amount?: number;  // Alias for amount for backward compatibility
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/payments',
    RECEIPTS: '/payments/receipts',
    PAYMENTS: '/payments/payments',
    MODES: '/payments/modes',
    PENDING: '/payments/pending',
    ALLOCATE: '/payments/allocate'
} as const;

// ============================================
// API Module
// ============================================

export const paymentsApi = {
    // Get all payments
    getAll: (params: PaymentParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    // Get payment by ID
    getById: (paymentId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${paymentId}`);
    },

    // Create payment
    create: (data: PaymentData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.BASE, data);
    },

    // Update payment
    update: (paymentId: number, data: Partial<PaymentData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`${ENDPOINTS.BASE}/${paymentId}`, data);
    },

    // Delete payment
    delete: (paymentId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/${paymentId}`);
    },

    // Get receipts (customer payments)
    getReceipts: (params: PaymentParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.RECEIPTS, { params });
    },

    // Get payments (supplier payments)
    getPayments: (params: PaymentParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PAYMENTS, { params });
    },

    // Get payment modes
    getModes: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.MODES);
    },

    // Get pending payments
    getPending: (params: PaymentParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PENDING, { params });
    },

    // Allocate payment to invoices
    allocate: (paymentId: number, allocations: PaymentAllocation[]): Promise<AxiosResponse> => {
        return apiHelpers.post(`${ENDPOINTS.ALLOCATE}/${paymentId}`, { allocations });
    },

    // Print receipt
    printReceipt: (paymentId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${paymentId}/print`, { responseType: 'blob' });
    },

    // Get outstanding invoices for a party
    getOutstandingInvoices: (partyId: number, partyType: 'customer' | 'supplier' = 'customer'): Promise<AxiosResponse> => {
        return apiHelpers.get('/invoices/outstanding', { params: { party_id: partyId, party_type: partyType } });
    },

    // Get unreconciled transactions for bank reconciliation
    getUnreconciledTransactions: (params: { date?: string; bank_account?: string } = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/unreconciled`, { params });
    },

    // Start bank reconciliation
    startBankReconciliation: (data: {
        bank_account: string;
        reconciliation_date: string;
        bank_statement_balance: number;
        book_balance: number;
    }): Promise<AxiosResponse> => {
        return apiHelpers.post(`${ENDPOINTS.BASE}/reconcile`, data);
    }
};
