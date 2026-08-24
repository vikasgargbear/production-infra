/**
 * Bank Accounts API Module
 * Handles bank account management and transactions
 *
 * ENDPOINTS: /bank-accounts (backend: app/api/routes/master/bank_accounts.py)
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import { createCrudApi } from '../../utils/createCrudApi';

// ============================================================================
// TYPES
// ============================================================================
const crud = createCrudApi({ basePath: '/bank-accounts' });

export const bankAccountsApi = {
    ...crud,

    create: (_data: any) => rejectCanonicalWrite('Creating a bank account'),
    update: (_id: number | string, _data: any) => rejectCanonicalWrite('Editing a bank account'),
    delete: (_id: number | string) => rejectCanonicalWrite('Deleting a bank account'),

    // Transactions
    getTransactions: (accountId: number | string, params: any = {}) => {
        return apiHelpers.get(`/bank-accounts/${accountId}/transactions`, { params });
    },

    recordTransaction: (_accountId: number | string, _data: any) =>
        rejectCanonicalWrite('Recording a bank transaction'),

    // Balance & Reconciliation
    getBalance: (accountId: number | string) => {
        return apiHelpers.get(`/bank-accounts/${accountId}/balance`);
    },

    reconcile: (_accountId: number | string, _data: any) =>
        rejectCanonicalWrite('Reconciling a bank account'),

    getStatement: (accountId: number | string, params: any = {}) => {
        return apiHelpers.get(`/bank-accounts/${accountId}/statement`, { params });
    },

    getActive: () => {
        return apiHelpers.get('/bank-accounts', { params: { is_active: true } });
    },

    search: (query: string) => {
        return apiHelpers.get('/bank-accounts', { params: { search: query } });
    },

    setDefaultAccount: (_id: number | string) =>
        rejectCanonicalWrite('Changing the default bank account')
};
