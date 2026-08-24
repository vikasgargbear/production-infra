/**
 * Inventory Movements API Module
 *
 * All reads go through the canonical /inventory/movements endpoint which
 * uses UUID-keyed stock_ledger_entries — NOT the legacy /inventory-movements
 * integer-ID path which no longer exists in the canonical ERP router.
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface MovementParams {
    product_id?: string;   // UUID
    batch_id?: string;     // UUID
    movement_type?: 'in' | 'out' | 'transfer' | 'adjustment';
    from_date?: string;
    to_date?: string;
    limit?: number;
    offset?: number;
}

// ============================================
// Endpoints — canonical ERP reads (UUID-based)
// ============================================

const ENDPOINTS = {
    /** Canonical stock-ledger movements endpoint (UUID, tenant-scoped). */
    BASE: '/inventory/movements',
} as const;

// ============================================
// API Module
// ============================================

export const inventoryMovementsApi = {
    /** List all movements, optionally filtered by date range. */
    getAll: (params: MovementParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    /** List movements for a single product (UUID). */
    getByProduct: (productId: string, params: MovementParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params: { ...params, product_id: productId } });
    },

    /** List movements for a single batch (UUID). */
    getByBatch: (batchId: string, params: MovementParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params: { ...params, batch_id: batchId } });
    }
};
