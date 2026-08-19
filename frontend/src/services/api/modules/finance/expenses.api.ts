/**
 * Expenses API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface ExpenseParams {
    from_date?: string;
    to_date?: string;
    category?: string;
    status?: string;
    limit?: number;
    offset?: number;
}

export interface ExpenseData {
    expense_date: string;
    amount: number;
    category: string;
    description?: string;
    payment_mode?: string;
    reference_number?: string;
    vendor_name?: string;
    is_recurring?: boolean;
}

// ============================================
// API Module
// ============================================

export const expensesApi = {
    getAll: (params: ExpenseParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get('/expense-claims', { params });
    },

    getById: (claimId: number | string): Promise<AxiosResponse> => {
        return apiHelpers.get(`/expense-claims/${claimId}`);
    },

    create: (data: any): Promise<AxiosResponse> => {
        return apiHelpers.post('/expense-claims', data);
    },

    generateClaimNumber: (): Promise<AxiosResponse> => {
        return apiHelpers.post('/expense-claims/generate-claim-number', {});
    },

    getCategories: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/expense-claims/expense-types');
    },

    getSummary: (params: ExpenseParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get('/expense-claims', { params });
    },

};
