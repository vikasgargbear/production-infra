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
    UNALLOCATED: '/payment-allocation/unallocated',
    OUTSTANDING: '/payment-allocation/outstanding-invoices',
    ALLOCATE: '/payment-allocation/allocate',
    AUTO: '/payment-allocation/auto'
} as const;

// ============================================
// API Module
// ============================================

export const paymentAllocationApi = {
    // Get unallocated payments
    getUnallocated: (params: AllocationParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.UNALLOCATED, { params });
    },

    // Get outstanding invoices for a party
    getOutstandingInvoices: (partyId: number, partyType: 'customer' | 'supplier'): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.OUTSTANDING, {
            params: { party_id: partyId, party_type: partyType }
        });
    },

    // Allocate payment to invoices
    allocate: (data: AllocationData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.ALLOCATE, data);
    },

    // Auto-allocate payments
    autoAllocate: (params: AllocationParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.AUTO, params);
    },

    // Deallocate
    deallocate: (allocationId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/${allocationId}`);
    }
};
