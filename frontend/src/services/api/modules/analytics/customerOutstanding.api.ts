/**
 * Customer Outstanding API Module
 * Handles customer outstanding balances
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface OutstandingParams {
    party_type?: 'customer' | 'supplier';
    status?: 'all' | 'overdue' | 'current';
    min_amount?: number;
    max_amount?: number;
    sort_by?: 'amount' | 'date' | 'name';
    sort_order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
}

export interface OutstandingCustomer {
    customer_id: number;
    customer_name: string;
    outstanding: number;
    overdue_amount: number;
    last_payment_date?: string;
    days_overdue?: number;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/customer-outstanding',
    SUMMARY: '/customer-outstanding/summary',
    BY_CUSTOMER: (id: number) => `/customer-outstanding/${id}`,
    AGING: '/customer-outstanding/aging'
} as const;

// ============================================
// API Module
// ============================================

export const customerOutstandingApi = {
    // Get all outstanding
    getAll: (params: OutstandingParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    // Get summary
    getSummary: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.SUMMARY);
    },

    // Get by customer
    getByCustomer: (customerId: number, params: OutstandingParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BY_CUSTOMER(customerId), { params });
    },

    // Get aging analysis
    getAging: (params: OutstandingParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.AGING, { params });
    }
};
