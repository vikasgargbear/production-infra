/**
 * Supplier Invoices API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface SupplierInvoiceParams {
    supplier_id?: number;
    status?: 'unpaid' | 'partial' | 'paid';
    from_date?: string;
    to_date?: string;
    limit?: number;
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

    create: (data: SupplierInvoiceData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.BASE, data);
    },

    update: (invoiceId: number, data: Partial<SupplierInvoiceData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`${ENDPOINTS.BASE}/${invoiceId}`, data);
    },

    delete: (invoiceId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/${invoiceId}`);
    }
};
