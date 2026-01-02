/**
 * Schemes & Discounts API Module
 * Handles pricing schemes, promotions, and discounts
 * 
 * ENDPOINTS: /schemes-discounts (backend: app/api/routes/schemes_discounts.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
    BASE: '/schemes-discounts',
    SCHEMES: '/schemes-discounts/schemes',
    DISCOUNTS: '/schemes-discounts/discounts',
    ACTIVE: '/schemes-discounts/active',
    APPLY: '/schemes-discounts/apply'
};

export const schemesDiscountsApi = {
    // =========================================================================
    // SCHEMES
    // =========================================================================

    // Get all schemes
    getSchemes: (params: Record<string, any> = {}) => {
        return apiHelpers.get<any>(ENDPOINTS.SCHEMES, { params });
    },

    // Get scheme by ID
    getSchemeById: (id: number | string) => {
        return apiHelpers.get<any>(`${ENDPOINTS.SCHEMES}/${id}`);
    },

    // Create scheme
    createScheme: (data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post<any>(ENDPOINTS.SCHEMES, cleanedData);
    },

    // Update scheme
    updateScheme: (id: number | string, data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put<any>(`${ENDPOINTS.SCHEMES}/${id}`, cleanedData);
    },

    // Delete scheme
    deleteScheme: (id: number | string) => {
        return apiHelpers.delete<void>(`${ENDPOINTS.SCHEMES}/${id}`);
    },

    // =========================================================================
    // DISCOUNTS
    // =========================================================================

    // Get all discounts
    getDiscounts: (params: Record<string, any> = {}) => {
        return apiHelpers.get<any>(ENDPOINTS.DISCOUNTS, { params });
    },

    // Create discount
    createDiscount: (data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post<any>(ENDPOINTS.DISCOUNTS, cleanedData);
    },

    // Update discount
    updateDiscount: (id: number | string, data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put<any>(`${ENDPOINTS.DISCOUNTS}/${id}`, cleanedData);
    },

    // =========================================================================
    // APPLICATION
    // =========================================================================

    // Get active schemes/discounts
    getActive: () => {
        return apiHelpers.get<any>(ENDPOINTS.ACTIVE);
    },

    // Apply scheme to cart
    apply: (data: any) => {
        return apiHelpers.post<any>(ENDPOINTS.APPLY, data);
    },

    // Get applicable schemes for products
    getApplicable: (productIds: (number | string)[], customerId: number | string | null = null) => {
        return apiHelpers.get<any>(`${ENDPOINTS.BASE}/applicable`, {
            params: { product_ids: productIds.join(','), customer_id: customerId }
        });
    }
};
