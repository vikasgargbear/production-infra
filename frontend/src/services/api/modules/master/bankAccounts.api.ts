/**
 * Bank Accounts API Module
 * Handles bank account management and transactions
 *
 * ENDPOINTS: /bank-accounts (backend: app/api/routes/master/bank_accounts.py)
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import { decodeCanonicalBankAccountList } from './canonicalMasterReads';

// ============================================================================
// TYPES
// ============================================================================
export const bankAccountsApi = {
    getAll: () => apiHelpers.get('/bank-accounts')
        .then(response => ({ ...response, data: decodeCanonicalBankAccountList(response.data) })),

    create: (_data: any) => rejectCanonicalWrite('Creating a bank account'),
    update: (_id: number | string, _data: any) => rejectCanonicalWrite('Editing a bank account'),
    delete: (_id: number | string) => rejectCanonicalWrite('Deleting a bank account'),

    getActive: () => apiHelpers.get('/bank-accounts')
        .then(response => ({ ...response, data: decodeCanonicalBankAccountList(response.data) })),

    setDefaultAccount: (_id: number | string) =>
        rejectCanonicalWrite('Changing the default bank account')
};
