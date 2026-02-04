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
        return apiHelpers.put('/company/info', data);
    },

    uploadLogo: (fileOrBase64: File | string): Promise<AxiosResponse> => {
        if (typeof fileOrBase64 === 'string') {
            return apiHelpers.post('/company/logo', { logo: fileOrBase64 });
        }
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                apiHelpers.post('/company/logo', { logo: reader.result as string })
                    .then(resolve)
                    .catch(reject);
            };
            reader.onerror = reject;
            reader.readAsDataURL(fileOrBase64);
        });
    },

    uploadQRCode: (fileOrBase64: File | string): Promise<AxiosResponse> => {
        if (typeof fileOrBase64 === 'string') {
            return apiHelpers.post('/company/qr-code', { qr_code: fileOrBase64 });
        }
        // Convert File to base64 then send as JSON
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                apiHelpers.post('/company/qr-code', { qr_code: reader.result as string })
                    .then(resolve)
                    .catch(reject);
            };
            reader.onerror = reject;
            reader.readAsDataURL(fileOrBase64);
        });
    }
};
