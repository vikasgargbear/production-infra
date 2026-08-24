/**
 * Payment Allocation API Module
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface AllocationParams {
    party_id?: number | string;
    party_type?: 'customer' | 'supplier';
    from_date?: string;
    to_date?: string;
}

export interface AllocationData {
    payment_id: number;
    allocations: {
        invoice_id: number | string;
        amount: number;
    }[];
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/payment-allocation',
    UNALLOCATED_PAYMENTS: '/payment-allocation/unallocated-payments',
    UNPAID_INVOICES: '/payment-allocation/unpaid-invoices',
    ALLOCATE: '/payment-allocation/allocate',
    ALLOCATE_BULK: '/payment-allocation/allocate-bulk',
    AUTO_ALLOCATE: '/payment-allocation/auto-allocate'
} as const;

// ============================================
// API Module
// ============================================

export const paymentAllocationApi = {
    getUnallocatedPayments: (params: AllocationParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.UNALLOCATED_PAYMENTS, { params });
    },

    getUnpaidInvoices: (customerId: number | string): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.UNPAID_INVOICES, {
            params: { customer_id: customerId }
        });
    },

    allocate: (_data: AllocationData): Promise<AxiosResponse> => rejectCanonicalWrite('Allocating a payment'),

    allocateBulk: (_data: AllocationData): Promise<AxiosResponse> => rejectCanonicalWrite('Allocating payments in bulk'),

    autoAllocate: (_paymentId: number, _method: 'fifo' | 'lifo' | 'proportional' = 'fifo'): Promise<AxiosResponse> => rejectCanonicalWrite('Automatically allocating a payment'),

    getPaymentAllocations: (paymentId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/payment/${paymentId}/allocations`);
    },

    getInvoicePayments: (invoiceId: number | string): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/invoice/${invoiceId}/payments`);
    },

    getCustomerReceiptReadback: (paymentId: string): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/payment/${paymentId}/readback`);
    },

    deallocate: (_allocationId: number): Promise<AxiosResponse> => rejectCanonicalWrite('Removing a payment allocation')
};
