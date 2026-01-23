/**
 * Company API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface CompanyData {
    org_name: string;
    legal_name?: string;
    gst_number?: string;
    pan?: string;
    drug_license?: string;
    fssai_number?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
    email?: string;
    website?: string;
    logo_url?: string;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/company',
    INFO: '/company/info',
    LOGO: '/company/logo',
    GST: '/company/gst-info',
    BANK: '/company/bank-details'
} as const;

// ============================================
// API Module
// ============================================

export const companyApi = {
    getInfo: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.INFO);
    },

    updateInfo: (data: Partial<CompanyData>): Promise<AxiosResponse> => {
        return apiHelpers.put(ENDPOINTS.INFO, data);
    },

    uploadLogo: (logoBase64: string): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.LOGO, { logo: logoBase64 });
    },

    getLogo: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.LOGO);
    },

    deleteLogo: (): Promise<AxiosResponse> => {
        return apiHelpers.delete(ENDPOINTS.LOGO);
    },

    getGSTInfo: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.GST);
    },

    updateGSTInfo: (data: Record<string, any>): Promise<AxiosResponse> => {
        return apiHelpers.put(ENDPOINTS.GST, data);
    },

    getBankDetails: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BANK);
    },

    updateBankDetails: (data: Record<string, any>): Promise<AxiosResponse> => {
        return apiHelpers.put(ENDPOINTS.BANK, data);
    },

    // Aliases for compatibility
    getCompanyProfile: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.INFO);
    },

    getOrganizationId: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/company/org-id');
    },

    getCompanyInfo: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.INFO);
    },

    updateCompanyInfo: (data: Partial<CompanyData>): Promise<AxiosResponse> => {
        return apiHelpers.put(ENDPOINTS.INFO, data);
    },

    // Upload QR code for payments
    uploadQRCode: (file: File): Promise<AxiosResponse> => {
        const formData = new FormData();
        formData.append('qr_code', file);
        return apiHelpers.post('/company/qr-code', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });
    }
};
