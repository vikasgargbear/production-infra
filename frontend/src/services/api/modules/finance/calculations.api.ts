/**
 * Calculations API Module
 * Handles financial calculations
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface GSTCalculationParams {
    amount: number;
    gst_percent: number;
    is_inclusive?: boolean;
}

export interface DiscountCalculationParams {
    amount: number;
    discount_percent?: number;
    discount_amount?: number;
}

export interface MarginCalculationParams {
    cost_per_unit: number;
    selling_price: number;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/calculations',
    GST: '/calculations/gst',
    DISCOUNT: '/calculations/discount',
    MARGIN: '/calculations/margin',
    ROUND_OFF: '/calculations/round-off'
} as const;

// ============================================
// API Module
// ============================================

export const calculationsApi = {
    // Calculate GST
    calculateGST: (params: GSTCalculationParams): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.GST, params);
    },

    // Calculate discount
    calculateDiscount: (params: DiscountCalculationParams): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.DISCOUNT, params);
    },

    // Calculate margin
    calculateMargin: (params: MarginCalculationParams): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.MARGIN, params);
    },

    // Round off amount
    roundOff: (amount: number): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.ROUND_OFF, { amount });
    }
};
