/**
 * Utils API Module
 * Utility endpoints
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/utils',
    VALIDATE_GSTIN: '/utils/validate-gst_number',
    VALIDATE_PAN: '/utils/validate-pan',
    VALIDATE_IFSC: '/utils/validate-ifsc',
    GENERATE_BARCODE: '/utils/generate-barcode',
    SEND_SMS: '/utils/send-sms',
    SEND_EMAIL: '/utils/send-email',
    SEND_WHATSAPP: '/utils/send-whatsapp'
} as const;

// ============================================
// API Module
// ============================================

const utilsApi = {
    validateGSTIN: (gst_number: string): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.VALIDATE_GSTIN, { gst_number });
    },

    validatePAN: (pan: string): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.VALIDATE_PAN, { pan });
    },

    validateIFSC: (ifsc: string): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.VALIDATE_IFSC, { ifsc });
    },

    generateBarcode: (data: string, format?: 'EAN13' | 'CODE128'): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.GENERATE_BARCODE, { data, format });
    },

    sendSMS: (phone: string, message: string): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.SEND_SMS, { phone, message });
    },

    sendEmail: (email: string, subject: string, body: string): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.SEND_EMAIL, { email, subject, body });
    },

    sendWhatsApp: (phone: string, message: string): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.SEND_WHATSAPP, { phone, message });
    }
};

export default utilsApi;
