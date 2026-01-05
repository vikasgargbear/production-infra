/**
 * Journal API Module
 */

import { apiHelpers } from '../../apiClient';
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
    create: (data: JournalEntryData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.BASE, data);
    },

    // Update
    update: (entryId: number, data: Partial<JournalEntryData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`${ENDPOINTS.BASE}/${entryId}`, data);
    },

    // Delete
    delete: (entryId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/${entryId}`);
    },

    // Get voucher types
    getVoucherTypes: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.VOUCHER_TYPES);
    }
};
