/**
 * Company API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';

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
// API Module
// ============================================

export const companyApi = {
    // Full profile: company info + bank accounts + logo + QR in one call
    getCompanyProfile: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/company/profile');
    },

    // Basic company info (also returns logo + QR)
    getCompanyInfo: (): Promise<AxiosResponse> => {
        return apiHelpers.get('/company/info');
    },

    updateCompanyInfo: (data: Partial<CompanyData>): Promise<AxiosResponse> => {
        void data;
        return rejectCanonicalWrite('Updating the company profile');
    },

    uploadLogo: (fileOrBase64: File | string): Promise<AxiosResponse> => {
        void fileOrBase64;
        return rejectCanonicalWrite('Updating the company logo');
    },

    uploadQRCode: (fileOrBase64: File | string): Promise<AxiosResponse> => {
        void fileOrBase64;
        return rejectCanonicalWrite('Updating the company payment QR code');
    }
};
