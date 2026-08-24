/**
 * Supplier Invoices API Module
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface SupplierInvoiceParams {
    supplier_id?: number | string;
    status?: string;
    payment_status?: 'pending' | 'partial' | 'paid' | 'overdue';
    search?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
    skip?: number;
    offset?: number;
}

export interface SupplierInvoiceData {
    supplier_id: number;
    grn_id?: number;
    invoice_number: string;
    invoice_date: string;
    due_date?: string;
    total_amount: number;
    gst_amount?: number;
    discount_amount?: number;
    items?: any[];
    notes?: string;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/supplier-invoices/',
    BY_SUPPLIER: (id: number) => `/supplier-invoices/supplier/${id}`,
    UNPAID: '/supplier-invoices/unpaid/'
} as const;

// ============================================
// API Module
// ============================================

export const supplierInvoicesApi = {
    getAll: (params: SupplierInvoiceParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    getById: (invoiceId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${invoiceId}`);
    },

    getBySupplier: (supplierId: number, params: SupplierInvoiceParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BY_SUPPLIER(supplierId), { params });
    },

    getUnpaid: (params: SupplierInvoiceParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.UNPAID, { params });
    },

    create: (_data: SupplierInvoiceData): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy supplier-invoice creation'),

    update: (_invoiceId: number, _data: Partial<SupplierInvoiceData>): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy supplier-invoice editing'),

    delete: (_invoiceId: number): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy supplier-invoice deletion')
};
