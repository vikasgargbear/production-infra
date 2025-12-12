/**
 * Bank Accounts API Module
 * Handles bank account management and transactions
 * 
 * ENDPOINTS: /bank-accounts (backend: app/api/routes/master/bank_accounts.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
    BASE: '/bank-accounts',
    DETAILS: (id) => `/bank-accounts/${id}`,
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
    getAll: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    // Get bank account by ID
    getById: (id) => {
        return apiHelpers.get(ENDPOINTS.DETAILS(id));
    },

    // Create new bank account
    create: (data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
    },

    // Update bank account
    update: (id, data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
    },

    // Delete bank account
    delete: (id) => {
        return apiHelpers.delete(ENDPOINTS.DETAILS(id));
    },

    // =========================================================================
    // TRANSACTIONS
    // =========================================================================

    // Get transactions for account
    getTransactions: (accountId, params = {}) => {
        return apiHelpers.get(ENDPOINTS.TRANSACTIONS(accountId), { params });
    },

    // Record transaction
    recordTransaction: (accountId, data) => {
        return apiHelpers.post(ENDPOINTS.TRANSACTIONS(accountId), data);
    },

    // =========================================================================
    // BALANCE & RECONCILIATION
    // =========================================================================

    // Get current balance
    getBalance: (accountId) => {
        return apiHelpers.get(ENDPOINTS.BALANCE(accountId));
    },

    // Reconcile account
    reconcile: (accountId, data) => {
        return apiHelpers.post(ENDPOINTS.RECONCILE(accountId), data);
    },

    // Get bank statement
    getStatement: (accountId, params = {}) => {
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
    search: (query) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params: { search: query } });
    }
};
