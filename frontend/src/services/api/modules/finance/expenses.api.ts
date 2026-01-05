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
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/expenses',
    CATEGORIES: '/expenses/categories',
    SUMMARY: '/expenses/summary'
} as const;

// ============================================
// API Module
// ============================================

export const expensesApi = {
    getAll: (params: ExpenseParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    getById: (expenseId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${expenseId}`);
    },

    create: (data: ExpenseData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.BASE, data);
    },

    update: (expenseId: number, data: Partial<ExpenseData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`${ENDPOINTS.BASE}/${expenseId}`, data);
    },

    delete: (expenseId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/${expenseId}`);
    },

    getCategories: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.CATEGORIES);
    },

    getSummary: (params: ExpenseParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.SUMMARY, { params });
    }
};
