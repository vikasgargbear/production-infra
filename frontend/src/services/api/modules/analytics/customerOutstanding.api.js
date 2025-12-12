/**
 * Customer Outstanding API Module
 * Handles customer outstanding balance tracking
 * 
 * ENDPOINTS: /customer-outstanding (backend: app/api/routes/analytics/outstanding.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    BASE: '/customer-outstanding',
    SUMMARY: '/customer-outstanding/summary',
    AGING: '/customer-outstanding/aging',
    DETAILS: (id) => `/customer-outstanding/${id}`,
    HISTORY: (id) => `/customer-outstanding/${id}/history`,
    INVOICES: (id) => `/customer-outstanding/${id}/invoices`
};

export const customerOutstandingApi = {
    // =========================================================================
    // OVERVIEW
    // =========================================================================

    // Get all customers with outstanding
    getAll: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    // Get outstanding summary
    getSummary: () => {
        return apiHelpers.get(ENDPOINTS.SUMMARY);
    },

    // Get aging analysis
    getAging: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.AGING, { params });
    },

    // =========================================================================
    // CUSTOMER SPECIFIC
    // =========================================================================

    // Get customer outstanding details
    getByCustomer: (customerId) => {
        return apiHelpers.get(ENDPOINTS.DETAILS(customerId));
    },

    // Get customer payment history
    getHistory: (customerId, params = {}) => {
        return apiHelpers.get(ENDPOINTS.HISTORY(customerId), { params });
    },

    // Get customer outstanding invoices
    getInvoices: (customerId) => {
        return apiHelpers.get(ENDPOINTS.INVOICES(customerId));
    },

    // =========================================================================
    // FILTERS
    // =========================================================================

    // Get overdue customers
    getOverdue: () => {
        return apiHelpers.get(ENDPOINTS.BASE, { params: { overdue: true } });
    },

    // Get customers by age bucket
    getByAgeBucket: (bucket) => {
        // bucket: 'current', '1-30', '31-60', '61-90', '90+'
        return apiHelpers.get(ENDPOINTS.BASE, { params: { age_bucket: bucket } });
    },

    // Get critical accounts
    getCritical: () => {
        return apiHelpers.get(ENDPOINTS.BASE, { params: { priority: 'critical' } });
    }
};
