/**
 * Batches API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface BatchParams {
    product_id?: number;
    expiring_soon?: boolean;
    expired?: boolean;
    days?: number;
    limit?: number;
    offset?: number;
}

export interface BatchData {
    product_id: number;
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
    BASE: '/batches',
    BY_PRODUCT: (id: number) => `/products/${id}/batches`,
    EXPIRING: '/batches/expiring',
    EXPIRED: '/batches/expired'
} as const;

// ============================================
// API Module
// ============================================

export const batchesApi = {
    getAll: (params: BatchParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    getById: (batchId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${batchId}`);
    },

    getByProduct: (productId: number, params: BatchParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BY_PRODUCT(productId), { params });
    },

    create: (data: BatchData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.BASE, data);
    },

    update: (batchId: number, data: Partial<BatchData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`${ENDPOINTS.BASE}/${batchId}`, data);
    },

    delete: (batchId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/${batchId}`);
    },

    getExpiring: (days: number = 90): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.EXPIRING, { params: { days } });
    },

    getExpired: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.EXPIRED);
    }
};
