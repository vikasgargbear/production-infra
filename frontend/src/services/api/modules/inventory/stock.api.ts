/**
 * Stock API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface StockParams {
    product_id?: number;
    batch_id?: number;
    location?: string;
    low_stock?: boolean;
    expiring_soon?: boolean;
    days?: number;
    limit?: number;
    offset?: number;
}

export interface StockAdjustmentData {
    product_id: number;
    batch_id?: number;
    adjustment_type: 'add' | 'remove' | 'set';
    quantity: number;
    reason: string;
    notes?: string;
}

export interface StockTransferData {
    product_id: number;
    batch_id?: number;
    from_location: string;
    to_location: string;
    quantity: number;
    notes?: string;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/stock',
    CURRENT: '/stock/current',
    ADJUSTMENTS: '/stock/adjustments',
    TRANSFERS: '/stock/transfers',
    LOW_STOCK: '/stock/low-stock',
    EXPIRING: '/stock/expiring',
    VALUATION: '/stock/valuation'
} as const;

// ============================================
// API Module
// ============================================

export const stockApi = {
    // Get current stock
    getCurrent: (params: StockParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.CURRENT, { params });
    },

    // Get by product
    getByProduct: (productId: number, params: StockParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/product/${productId}`, { params });
    },

    // Get by batch
    getByBatch: (batchId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/batch/${batchId}`);
    },

    // Adjust stock
    adjust: (data: StockAdjustmentData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.ADJUSTMENTS, data);
    },

    // Transfer stock
    transfer: (data: StockTransferData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.TRANSFERS, data);
    },

    // Get low stock items
    getLowStock: (params: StockParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.LOW_STOCK, { params });
    },

    // Get expiring items
    getExpiring: (days: number = 90): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.EXPIRING, { params: { days } });
    },

    // Get stock valuation
    getValuation: (params: StockParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.VALUATION, { params });
    },

    // Get adjustment history
    getAdjustments: (params: StockParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.ADJUSTMENTS, { params });
    },

    // Get transfer history
    getTransfers: (params: StockParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.TRANSFERS, { params });
    }
};
