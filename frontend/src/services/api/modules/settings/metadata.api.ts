/**
 * Metadata API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/metadata',
    STATES: '/metadata/states',
    CITIES: '/metadata/cities',
    CATEGORIES: '/metadata/product-categories',
    PRODUCT_TYPES: '/metadata/product-types',
    MANUFACTURERS: '/metadata/manufacturers',
    UNITS: '/metadata/units',
    PAYMENT_MODES: '/metadata/payment-modes',
    RETURN_REASONS: '/metadata/return-reasons',
    HSN_CODES: '/metadata/hsn-codes',
    GST_SLABS: '/metadata/gst-slabs'
} as const;

// ============================================
// API Module
// ============================================

export const metadataApi = {
    getStates: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.STATES);
    },

    getCities: (stateId?: number): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.CITIES, { params: { state_id: stateId } });
    },

    getProductCategories: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.CATEGORIES);
    },

    createProductCategory: (data: { category_name: string }): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.CATEGORIES, data);
    },

    getProductTypes: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PRODUCT_TYPES);
    },

    createProductType: (data: { type_name: string }): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.PRODUCT_TYPES, data);
    },

    getManufacturers: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.MANUFACTURERS);
    },

    getUnits: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.UNITS);
    },

    getPaymentModes: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PAYMENT_MODES);
    },

    getReturnReasons: (returnType?: 'sales' | 'purchase'): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.RETURN_REASONS, { params: { type: returnType } });
    },

    getHSNCodes: (search?: string): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.HSN_CODES, { params: { search } });
    },

    getGSTSlabs: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.GST_SLABS);
    },

    // Credit ratings for customer/supplier
    getCreditRatings: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/metadata/credit-ratings');
    },

    // Payment terms (e.g., Net 30, Net 60)
    getPaymentTerms: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/metadata/payment-terms');
    }
};
