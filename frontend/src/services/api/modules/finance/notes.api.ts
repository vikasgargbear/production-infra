/**
 * Notes API Module (Credit/Debit Notes)
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface NoteParams {
    note_type?: 'credit' | 'debit';
    party_type?: 'customer' | 'supplier';
    party_id?: number;
    from_date?: string;
    to_date?: string;
    status?: string;
    limit?: number;
    offset?: number;
}

export interface NoteData {
    note_type: 'credit' | 'debit';
    party_id: number;
    party_type: 'customer' | 'supplier';
    amount: number;
    note_date?: string;
    reason: string;
    reference_invoice_id?: number;
    items?: NoteItem[];
    notes?: string;
}

export interface NoteItem {
    product_id?: number;
    description?: string;
    quantity: number;
    rate: number;
    amount: number;
    gst_percent?: number;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/notes',
    CREDIT: '/notes/credit',
    DEBIT: '/notes/debit',
    REASONS: '/notes/reasons'
} as const;

// ============================================
// API Module
// ============================================

export const notesApi = {
    getAll: (params: NoteParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    getById: (noteId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${noteId}`);
    },

    create: (data: NoteData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.BASE, data);
    },

    update: (noteId: number, data: Partial<NoteData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`${ENDPOINTS.BASE}/${noteId}`, data);
    },

    delete: (noteId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/${noteId}`);
    },

    getCreditNotes: (params: NoteParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.CREDIT, { params });
    },

    getDebitNotes: (params: NoteParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.DEBIT, { params });
    },

    getReasons: (noteType?: 'credit' | 'debit'): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.REASONS, { params: { note_type: noteType } });
    },

    print: (noteId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${noteId}/print`, { responseType: 'blob' });
    },

    // Additional methods for compatibility
    getCreditNoteReasons: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.REASONS, { params: { note_type: 'credit' } });
    },

    getSettlementTypes: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/notes/settlement-types');
    },

    getLinkedInvoices: (noteId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${noteId}/invoices`);
    },

    getInvoiceItems: (invoiceId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`/invoices/${invoiceId}/items`);
    },

    createCreditDebitNote: (data: NoteData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.BASE, data);
    }
};
