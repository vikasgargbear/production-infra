/**
 * Journal API Module
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface JournalParams {
    from_date?: string;
    to_date?: string;
    voucher_type?: string;
    limit?: number;
    offset?: number;
}

export interface JournalEntryData {
    voucher_date: string;
    voucher_type: string;
    narration?: string;
    entries: {
        account_id: number;
        debit?: number;
        credit?: number;
        narration?: string;
    }[];
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/journal',
    VOUCHERS: '/journal/vouchers',
    VOUCHER_TYPES: '/journal/voucher-types'
} as const;

// ============================================
// API Module
// ============================================

export const journalApi = {
    // Get journal entries
    getAll: (params: JournalParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    // Get by ID
    getById: (entryId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${entryId}`);
    },

    // Create journal entry
    create: (_data: JournalEntryData): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Posting a journal entry'),

    // Update
    update: (_entryId: number, _data: Partial<JournalEntryData>): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Editing a journal entry'),

    // Delete
    delete: (_entryId: number): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Deleting a journal entry'),

    // Get voucher types
    getVoucherTypes: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.VOUCHER_TYPES);
    },

    // Get chart of accounts
    getChartOfAccounts: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/accounts/chart');
    }
};
