/**
 * GRN (Goods Receipt Note) API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface GRNParams {
    supplier_id?: number;
    po_id?: number;
    status?: string;
    from_date?: string;
    to_date?: string;
    limit?: number;
    offset?: number;
}

export interface GRNData {
    po_id?: number;
    supplier_id: number;
    grn_date?: string;
    invoice_number?: string;
    invoice_date?: string;
    items: GRNItem[];
    notes?: string;
}

export interface GRNItem {
    product_id: number;
    batch_number: string;
    quantity_received: number;
    manufacturing_date?: string;
    expiry_date: string;
    mrp: number;
    rate: number;
    discount_percent?: number;
    gst_percent?: number;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/grn',
    BY_PO: (id: number) => `/grn/po/${id}`,
    BY_SUPPLIER: (id: number) => `/grn/supplier/${id}`
} as const;

// ============================================
// API Module
// ============================================

export const grnApi = {
    getAll: (params: GRNParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    getById: (grnId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${grnId}`);
    },

    getByPO: (poId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BY_PO(poId));
    },

    getBySupplier: (supplierId: number, params: GRNParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BY_SUPPLIER(supplierId), { params });
    },

    create: async (data: GRNData): Promise<AxiosResponse> => {
        const response = await apiHelpers.post(ENDPOINTS.BASE, data);

        // Trigger delta sync after successful GRN creation
        // New stock received - update IndexedDB
        if (response?.data?.success || response?.data?.grn_id) {
            try {
                const { default: deltaSyncService } = await import('../../../offline/sync/deltaSyncService');
                deltaSyncService.afterGRNApproved();
            } catch (e) {
                console.warn('[GRN-API] Delta sync trigger failed:', e);
            }
        }

        return response;
    },

    update: (grnId: number, data: Partial<GRNData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`${ENDPOINTS.BASE}/${grnId}`, data);
    },

    delete: (grnId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/${grnId}`);
    },

    print: (grnId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${grnId}/print`, { responseType: 'blob' });
    }
};
