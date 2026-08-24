/**
 * Notes API Module (Credit/Debit Notes)
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
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
    unit_price: number;
    line_total: number;
    gst_percent?: number;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/credit-debit-notes',
    CREDIT: '/credit-debit-notes/credit-note',
    DEBIT: '/credit-debit-notes/debit-note',
    CREDIT_REASONS: '/credit-debit-notes/credit-note-reasons',
    DEBIT_REASONS: '/credit-debit-notes/debit-note-reasons',
    REASONS: '/credit-debit-notes/reasons/list'
} as const;

const SETTLEMENT_TYPES = [
    { value: 'adjust_future', label: 'Adjust in Future Invoices' },
    { value: 'account_credit', label: 'Account Credit Balance' },
    { value: 'cash_refund', label: 'Cash Refund' },
    { value: 'bank_transfer', label: 'Bank Transfer/NEFT/RTGS' },
    { value: 'cheque_refund', label: 'Cheque Refund' },
    { value: 'upi_refund', label: 'UPI/Digital Payment Refund' },
    { value: 'manual_adjustment', label: 'Manual Journal Adjustment' }
];

// ============================================
// API Module
// ============================================

export const notesApi = {
    getAll: (params: NoteParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    getById: (noteId: number | string): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${noteId}`);
    },

    create: (_data: NoteData): Promise<AxiosResponse> => rejectCanonicalWrite('Creating a credit or debit note'),

    delete: (_noteId: number | string, _cancellationReason: string = 'Cancelled'): Promise<AxiosResponse> => rejectCanonicalWrite('Deleting a credit or debit note'),

    getReasons: (noteType?: 'credit' | 'debit'): Promise<AxiosResponse> => {
        if (noteType === 'credit') {
            return apiHelpers.get(ENDPOINTS.CREDIT_REASONS);
        }
        if (noteType === 'debit') {
            return apiHelpers.get(ENDPOINTS.DEBIT_REASONS);
        }
        return apiHelpers.get(ENDPOINTS.REASONS);
    },

    print: (noteId: number | string): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${noteId}/print`, { responseType: 'blob' });
    },

    getSettlementTypes: (): Promise<AxiosResponse> => {
        return Promise.resolve({
            data: SETTLEMENT_TYPES,
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {}
        } as AxiosResponse);
    },

    getLinkedInvoices: (partyId: number, invoiceType: 'sales' | 'purchase' = 'sales'): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/linked-invoices/${partyId}`, {
            params: { invoice_type: invoiceType }
        });
    },

    getInvoiceItems: (invoiceId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/invoice-items/${invoiceId}`);
    },

};
