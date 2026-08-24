/**
 * Stock API Module
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface StockParams {
    product_id?: number | string;
    batch_id?: number | string;
    location?: string;
    low_stock?: boolean;
    expiring_soon?: boolean;
    days?: number;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
    skip?: number;
    sort?: string;
    order?: 'asc' | 'desc';
}

export interface StockAdjustmentItem {
    product_id: number;
    quantity: number;
    batch_number?: string | null;
}

export interface StockAdjustmentData {
    product_id?: number;          // For single-item adjustments
    batch_id?: number;
    adjustment_type: string;      // 'add' | 'remove' | 'set' | 'increase' | 'decrease'
    quantity?: number;            // For single-item adjustments
    reason: string;
    notes?: string;
    adjustment_date?: string;     // ISO date string
    items?: StockAdjustmentItem[]; // For batch adjustments
}

export interface StockTransferData {
    product_id: number;
    batch_id?: number;
    source_location: number;
    destination_location: number;
    quantity: number;
    movement_date: string;
    reason?: string;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/inventory/stock',
    CURRENT: '/inventory/stock/current',
    ADJUSTMENTS: '/stock-adjustments/',
    /**
     * Canonical movement reads — stock_ledger_entries, UUID-keyed.
     * The legacy /stock-movements/ path is a write-only router; reads must
     * go through /inventory/movements (canonical_erp_reads).
     */
    MOVEMENTS: '/inventory/movements',
    TRANSFERS: '/stock-movements/transfer',
    LOW_STOCK: '/stock-movements/low-stock',
    EXPIRING: '/stock-movements/near-expiry',
    VALUATION: '/inventory/stock/valuation'
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

    // Adjust stock — route through canonical command; do not hit legacy endpoint
    adjust: (_data: StockAdjustmentData): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Stock adjustment'),

    // Transfer stock — route through canonical command; do not hit legacy endpoint
    transfer: (_data: StockTransferData): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Stock transfer'),

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

    // Get transfer history (read from canonical movements endpoint)
    getTransfers: (params: StockParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.MOVEMENTS, { params: { ...params, movement_type: 'transfer' } });
    },

    // Get stock movements (canonical stock_ledger_entries reads)
    getMovements: (params: StockParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.MOVEMENTS, { params });
    },

    // Get movements for a specific batch
    getBatchMovements: (batchId: number | string, params: StockParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.MOVEMENTS, { params: { ...params, batch_id: batchId } });
    },

    // Get movements for a specific product
    getProductMovements: (productId: number | string, params: StockParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.MOVEMENTS, { params: { ...params, product_id: productId } });
    },

    // Create stock adjustment — route through canonical command; do not hit legacy endpoint
    createAdjustment: (_data: StockAdjustmentData): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Stock adjustment'),
};
