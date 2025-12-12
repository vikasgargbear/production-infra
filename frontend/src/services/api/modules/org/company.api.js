/**
 * Company API Module
 * Handles company profile and settings
 * 
 * ENDPOINTS: /company (backend: app/api/routes/org/company.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    BASE: '/company',
    INFO: '/company/info',
    PROFILE: '/company/profile',
    SETTINGS: '/company/settings',
    BANK_ACCOUNTS: '/company/bank-accounts',
    QR_CODE: '/company/qr-code',
    ORG_ID: '/company/organization-id'
};

export const companyApi = {
    // =========================================================================
    // COMPANY INFO
    // =========================================================================

    // Get company information
    getInfo: () => {
        return apiHelpers.get(ENDPOINTS.INFO);
    },

    // Update company information
    updateInfo: (data) => {
        return apiHelpers.put(ENDPOINTS.INFO, data);
    },

    // Get complete company profile (includes bank accounts)
    getProfile: () => {
        return apiHelpers.get(ENDPOINTS.PROFILE);
    },

    // Get organization ID
    getOrganizationId: () => {
        return apiHelpers.get(ENDPOINTS.ORG_ID);
    },

    // =========================================================================
    // SETTINGS
    // =========================================================================

    // Get company settings
    getSettings: () => {
        return apiHelpers.get(ENDPOINTS.SETTINGS);
    },

    // Update company settings
    updateSettings: (settings) => {
        return apiHelpers.put(ENDPOINTS.SETTINGS, settings);
    },

    // =========================================================================
    // BANK ACCOUNTS
    // =========================================================================

    // Get all bank accounts
    getBankAccounts: () => {
        return apiHelpers.get(ENDPOINTS.BANK_ACCOUNTS);
    },

    // =========================================================================
    // QR CODE
    // =========================================================================

    // Upload payment QR code
    uploadQRCode: (qrData) => {
        return apiHelpers.post(ENDPOINTS.QR_CODE, qrData);
    }
};
