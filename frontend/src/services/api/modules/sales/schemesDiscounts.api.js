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
    getSchemes: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.SCHEMES, { params });
    },

    // Get scheme by ID
    getSchemeById: (id) => {
        return apiHelpers.get(`${ENDPOINTS.SCHEMES}/${id}`);
    },

    // Create scheme
    createScheme: (data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.SCHEMES, cleanedData);
    },

    // Update scheme
    updateScheme: (id, data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put(`${ENDPOINTS.SCHEMES}/${id}`, cleanedData);
    },

    // Delete scheme
    deleteScheme: (id) => {
        return apiHelpers.delete(`${ENDPOINTS.SCHEMES}/${id}`);
    },

    // =========================================================================
    // DISCOUNTS
    // =========================================================================

    // Get all discounts
    getDiscounts: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.DISCOUNTS, { params });
    },

    // Create discount
    createDiscount: (data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.DISCOUNTS, cleanedData);
    },

    // Update discount
    updateDiscount: (id, data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put(`${ENDPOINTS.DISCOUNTS}/${id}`, cleanedData);
    },

    // =========================================================================
    // APPLICATION
    // =========================================================================

    // Get active schemes/discounts
    getActive: () => {
        return apiHelpers.get(ENDPOINTS.ACTIVE);
    },

    // Apply scheme to cart
    apply: (data) => {
        return apiHelpers.post(ENDPOINTS.APPLY, data);
    },

    // Get applicable schemes for products
    getApplicable: (productIds, customerId = null) => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/applicable`, {
            params: { product_ids: productIds.join(','), customer_id: customerId }
        });
    }
};
