/**
 * Purchases API Module
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface PurchaseParams {
    supplier_id?: number | string;
    status?: string;
    payment_status?: string;
    search?: string;
    from_date?: string;
    to_date?: string;
    date_from?: string;
    date_to?: string;
    dateFrom?: string;  // Alias for GST reports
    dateTo?: string;    // Alias for GST reports
    limit?: number;
    offset?: number;
}

export interface PurchaseOrderData {
    supplier_id: number;
    po_date?: string;
    expected_delivery_date?: string;
    items: PurchaseOrderItem[];
    notes?: string;
    status?: string;
}

export interface PurchaseOrderItem {
    product_id: number;
    quantity: number;
    rate: number;
    discount_percent?: number;
    gst_percent?: number;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/purchases/',
    ORDERS: '/purchases/',
    PURCHASE_ENTRY: '/purchases/purchase-entry',
    BY_SUPPLIER: (id: number) => `/purchases/supplier/${id}`,
    APPROVE: (id: number) => `/purchases/${id}/approve`,
    RECEIVE: (id: number) => `/purchases/${id}/receive`,
    FOR_ENTRY: (id: string | number) => `/purchases/${id}/for-entry`
} as const;

// ============================================
// API Module
// ============================================

export const purchasesApi = {
    getOrders: (params: PurchaseParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.ORDERS, { params });
    },

    getById: (poId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${poId}`);
    },

    getBySupplier: (supplierId: number, params: PurchaseParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BY_SUPPLIER(supplierId), { params });
    },

    create: (_data: PurchaseOrderData): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy purchase-order creation'),

    // Create purchase entry (supplier invoice + batches + auto-GRN)
    createEntry: (_data: any): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy purchase-entry creation'),

    update: (_poId: number, _data: Partial<PurchaseOrderData>): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy purchase-order editing'),

    delete: (_poId: number): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy purchase-order deletion'),

    approve: (_poId: number): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy purchase-order approval'),

    receive: (_poId: number, _receivedItems: any[]): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy purchase-order receipt'),

    print: (poId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${poId}/print`, { responseType: 'blob' });
    },

    parseInvoice: (formData: FormData): Promise<AxiosResponse> => {
        return apiHelpers.post('/purchase-upload/parse-invoice-safe', formData);
    },
    getReturnableInvoices: (params: { supplier_id: number | string }): Promise<AxiosResponse> => {
        return apiHelpers.get('/supplier-invoices/returnable/', { params });
    },

    // Search purchase orders
    search: (query: string, params: PurchaseParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.ORDERS, { params: { ...params, search: query } });
    },

    // Get PO data formatted for Purchase Entry pre-fill
    getForEntry: (poId: string | number): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.FOR_ENTRY(poId));
    },

    // Alias for getOrders
    getAll: (params: PurchaseParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.ORDERS, { params });
    }
};
