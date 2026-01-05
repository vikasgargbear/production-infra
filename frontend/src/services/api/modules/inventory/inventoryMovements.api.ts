/**
 * Inventory Movements API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface MovementParams {
    product_id?: number;
    batch_id?: number;
    movement_type?: 'in' | 'out' | 'transfer' | 'adjustment';
    from_date?: string;
    to_date?: string;
    limit?: number;
    offset?: number;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/inventory-movements',
    BY_PRODUCT: (id: number) => `/inventory-movements/product/${id}`,
    BY_BATCH: (id: number) => `/inventory-movements/batch/${id}`
} as const;

// ============================================
// API Module
// ============================================

export const inventoryMovementsApi = {
    getAll: (params: MovementParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    getByProduct: (productId: number, params: MovementParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BY_PRODUCT(productId), { params });
    },

    getByBatch: (batchId: number, params: MovementParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BY_BATCH(batchId), { params });
    }
};
