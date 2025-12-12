/**
 * Compliance API Module
 * Handles regulatory compliance tracking
 * 
 * ENDPOINTS: /compliance (backend: app/api/routes/compliance/compliance.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    BASE: '/compliance',
    STATUS: '/compliance/status',
    CHECKLIST: '/compliance/checklist',
    LICENSES: '/compliance/licenses',
    DOCUMENTS: '/compliance/documents',
    ALERTS: '/compliance/alerts',
    DUE_DATES: '/compliance/due-dates'
};

export const complianceApi = {
    // =========================================================================
    // STATUS
    // =========================================================================

    // Get compliance status
    getStatus: () => {
        return apiHelpers.get(ENDPOINTS.STATUS);
    },

    // Get compliance checklist
    getChecklist: () => {
        return apiHelpers.get(ENDPOINTS.CHECKLIST);
    },

    // Update checklist item
    updateChecklistItem: (itemId, data) => {
        return apiHelpers.put(`${ENDPOINTS.CHECKLIST}/${itemId}`, data);
    },

    // =========================================================================
    // LICENSES
    // =========================================================================

    // Get all licenses
    getLicenses: () => {
        return apiHelpers.get(ENDPOINTS.LICENSES);
    },

    // Add license
    addLicense: (data) => {
        return apiHelpers.post(ENDPOINTS.LICENSES, data);
    },

    // Update license
    updateLicense: (id, data) => {
        return apiHelpers.put(`${ENDPOINTS.LICENSES}/${id}`, data);
    },

    // Get expiring licenses
    getExpiringLicenses: () => {
        return apiHelpers.get(`${ENDPOINTS.LICENSES}/expiring`);
    },

    // =========================================================================
    // DOCUMENTS
    // =========================================================================

    // Get compliance documents
    getDocuments: () => {
        return apiHelpers.get(ENDPOINTS.DOCUMENTS);
    },

    // Upload document
    uploadDocument: (formData) => {
        return apiHelpers.post(ENDPOINTS.DOCUMENTS, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    },

    // =========================================================================
    // ALERTS
    // =========================================================================

    // Get compliance alerts
    getAlerts: () => {
        return apiHelpers.get(ENDPOINTS.ALERTS);
    },

    // Get due dates
    getDueDates: () => {
        return apiHelpers.get(ENDPOINTS.DUE_DATES);
    }
};
