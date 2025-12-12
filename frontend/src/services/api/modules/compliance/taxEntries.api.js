/**
 * Tax Entries API Module
 * Handles tax entry management
 * 
 * ENDPOINTS: /tax-entries (backend: app/api/routes/finance/tax.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
    BASE: '/tax-entries',
    DETAILS: (id) => `/tax-entries/${id}`,
    SUMMARY: '/tax-entries/summary',
    BY_PERIOD: '/tax-entries/by-period',
    CALCULATE: '/tax-entries/calculate'
};

export const taxEntriesApi = {
    // =========================================================================
    // CRUD OPERATIONS
    // =========================================================================

    // Get all tax entries
    getAll: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    // Get tax entry by ID
    getById: (id) => {
        return apiHelpers.get(ENDPOINTS.DETAILS(id));
    },

    // Create tax entry
    create: (data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
    },

    // Update tax entry
    update: (id, data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
    },

    // Delete tax entry
    delete: (id) => {
        return apiHelpers.delete(ENDPOINTS.DETAILS(id));
    },

    // =========================================================================
    // REPORTS
    // =========================================================================

    // Get tax summary
    getSummary: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.SUMMARY, { params });
    },

    // Get entries by period
    getByPeriod: (startDate, endDate) => {
        return apiHelpers.get(ENDPOINTS.BY_PERIOD, {
            params: { start_date: startDate, end_date: endDate }
        });
    },

    // =========================================================================
    // CALCULATIONS
    // =========================================================================

    // Calculate tax
    calculate: (data) => {
        return apiHelpers.post(ENDPOINTS.CALCULATE, data);
    }
};
