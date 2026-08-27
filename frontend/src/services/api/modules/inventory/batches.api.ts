/**
 * Batches API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';

// ============================================
// Type Definitions
// ============================================

export interface CanonicalProductBatch {
    batch_id: string;
    product_id: string;
    product_name: string;
    batch_number: string;
    manufacturing_date: string | null;
    expiry_date: string;
    mrp_per_unit: string;
    sale_price_per_unit: string;
    uom_conversion_id: string | null;
    location_id: string;
    branch_id: string;
    location_name: string;
    branch_name: string;
    cost_per_unit: string | null;
    quantity_available: string;
    days_to_expiry: number;
    fefo_expiry_tier: number | null;
    has_pending_sync: false;
    taxability: 'taxable' | 'exempt' | 'nil_rated' | 'non_gst' | null;
    gst_percent: string | null;
    batch_status: 'released' | 'blocked';
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BY_PRODUCT: (id: string) => `/products/${id}/batches`,
} as const;

// ============================================
// API Module
// ============================================

export const batchesApi = {
    getByProduct: (productId: string): Promise<AxiosResponse<{ batches: CanonicalProductBatch[] }>> => {
        if (!isCanonicalUuid(productId)) {
            throw new Error('Product batch lookup requires a canonical product UUID.');
        }
        return apiHelpers.get(ENDPOINTS.BY_PRODUCT(productId), {
            preserveExactDecimals: true,
        });
    },
};
