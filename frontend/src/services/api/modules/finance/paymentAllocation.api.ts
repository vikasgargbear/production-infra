/**
 * Payment Allocation API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface AllocationParams {
    party_id?: number;
    party_type?: 'customer' | 'supplier';
    from_date?: string;
    to_date?: string;
}

export interface AllocationData {
    payment_id: number;
    allocations: {
        invoice_id: number;
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

    getUnpaidInvoices: (customerId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.UNPAID_INVOICES, {
            params: { customer_id: customerId }
        });
    },

    allocate: (data: AllocationData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.ALLOCATE, data);
    },

    allocateBulk: (data: AllocationData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.ALLOCATE_BULK, data);
    },

    autoAllocate: (paymentId: number, method: 'fifo' | 'lifo' | 'proportional' = 'fifo'): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.AUTO_ALLOCATE, {
            payment_id: paymentId,
            method
        });
    },

    getPaymentAllocations: (paymentId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/payment/${paymentId}/allocations`);
    },

    getInvoicePayments: (invoiceId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/invoice/${invoiceId}/payments`);
    },

    deallocate: (allocationId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/allocation/${allocationId}`);
    }
};
