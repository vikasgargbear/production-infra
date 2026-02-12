/**
 * Expenses API Module
 */

import { apiHelpers } from '../../apiClient';
import { createCrudApi } from '../../utils/createCrudApi';
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

const crud = createCrudApi({ basePath: '/expenses', useCleanData: false });

export const expensesApi = {
    ...crud,

    getCategories: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/expenses/categories');
    },

    getSummary: (params: ExpenseParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get('/expenses/summary', { params });
    },

    // Alias for getCategories
    getExpenseTypes: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/expenses/categories');
    }
};
