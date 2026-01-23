/**
 * Purchases API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface PurchaseParams {
    supplier_id?: number;
    status?: string;
    from_date?: string;
    to_date?: string;
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
    BASE: '/purchases',
    ORDERS: '/purchases',
    BY_SUPPLIER: (id: number) => `/purchases/supplier/${id}`,
    APPROVE: (id: number) => `/purchases/${id}/approve`,
    RECEIVE: (id: number) => `/purchases/${id}/receive`
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

    create: (data: PurchaseOrderData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.BASE, data);
    },

    update: (poId: number, data: Partial<PurchaseOrderData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`${ENDPOINTS.BASE}/${poId}`, data);
    },

    delete: (poId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/${poId}`);
    },

    approve: (poId: number): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.APPROVE(poId));
    },

    receive: (poId: number, receivedItems: any[]): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.RECEIVE(poId), { items: receivedItems });
    },

    print: (poId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${poId}/print`, { responseType: 'blob' });
    },

    parseInvoice: (formData: FormData): Promise<AxiosResponse> => {
        return apiHelpers.post('/purchase-orders/parse-invoice', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },
    getReturnableInvoices: (params: { supplier_id: number | string }): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/returnable`, { params });
    },

    // Search purchase orders
    search: (query: string, params: PurchaseParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.ORDERS, { params: { ...params, search: query } });
    },

    // Alias for getOrders
    getAll: (params: PurchaseParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.ORDERS, { params });
    }
};
