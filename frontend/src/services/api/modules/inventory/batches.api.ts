/**
 * Batches API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface BatchParams {
    product_id?: string;   // UUID
    expiring_soon?: boolean;
    expired?: boolean;
    days?: number;
    limit?: number;
    offset?: number;
}

export interface BatchData {
    product_id: string;   // UUID
    batch_number: string;
    manufacturing_date?: string;
    expiry_date: string;
    mrp: number;
    sale_price?: number;
    cost_per_unit?: number;
    quantity: number;
    rack_location?: string;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    /** Canonical batch list — UUID-keyed, tenant-scoped. */
    BASE: '/inventory/batches/',
    /** Per-product batches via canonical products router (UUID preferred). */
    BY_PRODUCT: (id: string | number) => `/products/${id}/batches`,
    EXPIRING: '/inventory/batches/expiring',
    EXPIRED: '/inventory/batches/expired'
} as const;

// ============================================
// API Module
// ============================================

export const batchesApi = {
    getAll: (params: BatchParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    /** Fetch a single batch by its UUID. */
    getById: (batchId: string): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}${batchId}`);
    },

    /** Fetch batches for a product by its UUID (or legacy integer ID). */
    getByProduct: (productId: string | number, params: BatchParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BY_PRODUCT(productId), { params });
    },

    create: (data: BatchData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.BASE, data);
    },

    update: (batchId: string, data: Partial<BatchData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`${ENDPOINTS.BASE}${batchId}`, data);
    },

    delete: (batchId: string): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}${batchId}`);
    },

    getExpiring: (days: number = 90): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.EXPIRING, { params: { days } });
    },

    getExpired: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.EXPIRED);
    }
};
