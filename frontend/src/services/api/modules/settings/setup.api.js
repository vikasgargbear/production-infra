/**
 * Setup API Module
 * Handles initial company setup wizard
 * 
 * ENDPOINTS: /setup (backend: app/api/routes/org/initial_setup.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    BASE: '/setup',
    STATUS: '/setup/status',
    COMPANY: '/setup/company',
    BRANCHES: '/setup/branches',
    USERS: '/setup/users',
    PRODUCTS: '/setup/products',
    GST: '/setup/gst',
    COMPLETE: '/setup/complete'
};

export const setupApi = {
    // =========================================================================
    // STATUS
    // =========================================================================

    // Check setup status
    getStatus: () => {
        return apiHelpers.get(ENDPOINTS.STATUS);
    },

    // Check if setup is complete
    isComplete: () => {
        return apiHelpers.get(`${ENDPOINTS.STATUS}/complete`);
    },

    // =========================================================================
    // SETUP STEPS
    // =========================================================================

    // Setup company info
    setupCompany: (data) => {
        return apiHelpers.post(ENDPOINTS.COMPANY, data);
    },

    // Setup branches
    setupBranches: (data) => {
        return apiHelpers.post(ENDPOINTS.BRANCHES, data);
    },

    // Setup initial users
    setupUsers: (data) => {
        return apiHelpers.post(ENDPOINTS.USERS, data);
    },

    // Import initial products
    importProducts: (formData) => {
        return apiHelpers.post(ENDPOINTS.PRODUCTS, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },

    // Setup GST configuration
    setupGST: (data) => {
        return apiHelpers.post(ENDPOINTS.GST, data);
    },

    // =========================================================================
    // COMPLETE
    // =========================================================================

    // Mark setup as complete
    markComplete: () => {
        return apiHelpers.post(ENDPOINTS.COMPLETE);
    },

    // Skip setup step
    skipStep: (step) => {
        return apiHelpers.post(`${ENDPOINTS.BASE}/skip`, { step });
    }
};
