/**
 * Utils API Module
 * Utility endpoints
 */

import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';

// ============================================
// API Module
// ============================================

const utilsApi = {
    validateGSTIN: (_gst_number: string): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy GSTIN validation'),

    validatePAN: (_pan: string): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy PAN validation'),

    validateIFSC: (_ifsc: string): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy IFSC validation'),

    generateBarcode: (_data: string, _format?: 'EAN13' | 'CODE128'): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy barcode generation'),

    sendSMS: (_phone: string, _message: string): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Sending SMS'),

    sendEmail: (_email: string, _subject: string, _body: string): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Sending email'),

    sendWhatsApp: (_phone: string, _message: string): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Sending WhatsApp')
};

export default utilsApi;
