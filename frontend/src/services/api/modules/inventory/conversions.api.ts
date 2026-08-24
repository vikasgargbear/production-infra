/**
 * Conversions API Module
 * Handles unit of measure conversions
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface ConversionParams {
    product_id?: number;
    from_unit?: string;
    to_unit?: string;
}

export interface ConversionData {
    product_id: number;
    from_unit: string;
    to_unit: string;
    conversion_factor: number;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/conversions',
    BY_PRODUCT: (id: number) => `/conversions/product/${id}`,
    CALCULATE: '/conversions/calculate'
} as const;

// ============================================
// API Module
// ============================================

export const conversionsApi = {
    getAll: (params: ConversionParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    getByProduct: (productId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BY_PRODUCT(productId));
    },

    create: (data: ConversionData): Promise<AxiosResponse> => {
        return rejectCanonicalWrite('Legacy unit-conversion creation');
    },

    update: (conversionId: number, data: Partial<ConversionData>): Promise<AxiosResponse> => {
        return rejectCanonicalWrite('Legacy unit-conversion update');
    },

    delete: (conversionId: number): Promise<AxiosResponse> => {
        return rejectCanonicalWrite('Legacy unit-conversion deletion');
    },

    calculate: (productId: number, fromUnit: string, toUnit: string, quantity: number): Promise<AxiosResponse> => {
        return rejectCanonicalWrite('Legacy unit-conversion calculation');
    }
};
