/**
 * Bank Accounts API Module
 * Handles bank account management and transactions
 * 
 * ENDPOINTS: /bank-accounts (backend: app/api/routes/master/bank_accounts.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

// ============================================================================
// TYPES
// ============================================================================

export interface BankAccountParams {
    limit?: number;
    offset?: number;
    search?: string;
    is_active?: boolean;
}

// ============================================================================
// API
// ============================================================================

const ENDPOINTS = {
    BASE: '/bank-accounts',
    DETAILS: (id: number | string) => `/bank-accounts/${id}`,
    TRANSACTIONS: (id) => `/bank-accounts/${id}/transactions`,
    BALANCE: (id) => `/bank-accounts/${id}/balance`,
    RECONCILE: (id) => `/bank-accounts/${id}/reconcile`,
    STATEMENT: (id) => `/bank-accounts/${id}/statement`
};

export const bankAccountsApi = {
    // =========================================================================
    // CRUD OPERATIONS
    // =========================================================================

    // Get all bank accounts
    getAll: (params: BankAccountParams = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    // Get bank account by ID
    getById: (id: number | string) => {
        return apiHelpers.get(ENDPOINTS.DETAILS(id));
    },

    // Create new bank account
    create: (data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
    },

    // Update bank account
    update: (id: number | string, data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
    },

    // Delete bank account
    delete: (id: number | string) => {
        return apiHelpers.delete(ENDPOINTS.DETAILS(id));
    },

    // =========================================================================
    // TRANSACTIONS
    // =========================================================================

    // Get transactions for account
    getTransactions: (accountId: number | string, params: any = {}) => {
        return apiHelpers.get(ENDPOINTS.TRANSACTIONS(accountId), { params });
    },

    // Record transaction
    recordTransaction: (accountId: number | string, data: any) => {
        return apiHelpers.post(ENDPOINTS.TRANSACTIONS(accountId), data);
    },

    // =========================================================================
    // BALANCE & RECONCILIATION
    // =========================================================================

    // Get current balance
    getBalance: (accountId: number | string) => {
        return apiHelpers.get(ENDPOINTS.BALANCE(accountId));
    },

    // Reconcile account
    reconcile: (accountId: number | string, data: any) => {
        return apiHelpers.post(ENDPOINTS.RECONCILE(accountId), data);
    },

    // Get bank statement
    getStatement: (accountId: number | string, params: any = {}) => {
        return apiHelpers.get(ENDPOINTS.STATEMENT(accountId), { params });
    },

    // =========================================================================
    // HELPERS
    // =========================================================================

    // Get active accounts only
    getActive: () => {
        return apiHelpers.get(ENDPOINTS.BASE, { params: { is_active: true } });
    },

    // Search accounts
    search: (query: string) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params: { search: query } });
    },

    // =========================================================================
    // ALIASES (backward compatibility)
    // =========================================================================

    // Alias for getAll
    getBankAccounts: (params: BankAccountParams = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    // Alias for delete
    deleteBankAccount: (id: number | string) => {
        return apiHelpers.delete(ENDPOINTS.DETAILS(id));
    },

    // Set default account
    setDefaultAccount: (id: number | string) => {
        return apiHelpers.put(`${ENDPOINTS.DETAILS(id)}/set-default`, {});
    }
};
