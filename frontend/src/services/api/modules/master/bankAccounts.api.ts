/**
 * Bank Accounts API Module
 * Handles bank account management and transactions
 *
 * ENDPOINTS: /bank-accounts (backend: app/api/routes/master/bank_accounts.py)
 */

import { apiHelpers } from '../../apiClient';
import { createCrudApi } from '../../utils/createCrudApi';

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

const crud = createCrudApi({ basePath: '/bank-accounts' });

export const bankAccountsApi = {
    ...crud,

    // Transactions
    getTransactions: (accountId: number | string, params: any = {}) => {
        return apiHelpers.get(`/bank-accounts/${accountId}/transactions`, { params });
    },

    recordTransaction: (accountId: number | string, data: any) => {
        return apiHelpers.post(`/bank-accounts/${accountId}/transactions`, data);
    },

    // Balance & Reconciliation
    getBalance: (accountId: number | string) => {
        return apiHelpers.get(`/bank-accounts/${accountId}/balance`);
    },

    reconcile: (accountId: number | string, data: any) => {
        return apiHelpers.post(`/bank-accounts/${accountId}/reconcile`, data);
    },

    getStatement: (accountId: number | string, params: any = {}) => {
        return apiHelpers.get(`/bank-accounts/${accountId}/statement`, { params });
    },

    // Helpers
    getActive: () => {
        return apiHelpers.get('/bank-accounts', { params: { is_active: true } });
    },

    search: (query: string) => {
        return apiHelpers.get('/bank-accounts', { params: { search: query } });
    },

    // Aliases (backward compatibility)
    getBankAccounts: (params: BankAccountParams = {}) => {
        return apiHelpers.get('/bank-accounts', { params });
    },

    deleteBankAccount: (id: number | string) => {
        return apiHelpers.delete(`/bank-accounts/${id}`);
    },

    setDefaultAccount: (id: number | string) => {
        return apiHelpers.put(`/bank-accounts/${id}/set-default`, {});
    }
};
