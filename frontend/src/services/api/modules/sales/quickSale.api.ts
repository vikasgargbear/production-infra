/**
 * Quick Sale API Module
 * Handles POS-style quick sales
 * 
 * ENDPOINTS: /quick-sale (backend: app/api/routes/sales/quick_sale.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
    BASE: '/quick-sale',
    CREATE: '/quick-sale/create',
    COMPLETE: '/quick-sale/complete',
    VOID: '/quick-sale/void',
    RECEIPT: (id: number | string) => `/quick-sale/${id}/receipt`,
    TODAY: '/quick-sale/today',
    SUMMARY: '/quick-sale/summary'
};

export const quickSaleApi = {
    // =========================================================================
    // SALE OPERATIONS
    // =========================================================================

    // Create quick sale
    create: (data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post<any>(ENDPOINTS.CREATE, cleanedData);
    },

    // Complete sale (finalize payment)
    complete: (saleId: number | string, paymentData: any) => {
        return apiHelpers.post<any>(ENDPOINTS.COMPLETE, { sale_id: saleId, ...paymentData });
    },

    // Void sale
    void: (saleId: number | string, reason: string) => {
        return apiHelpers.post<any>(ENDPOINTS.VOID, { sale_id: saleId, reason });
    },

    // =========================================================================
    // QUERIES
    // =========================================================================

    // Get sale by ID
    getById: (id: number | string) => {
        return apiHelpers.get<any>(`${ENDPOINTS.BASE}/${id}`);
    },

    // Get today's sales
    getToday: () => {
        return apiHelpers.get<any>(ENDPOINTS.TODAY);
    },

    // Get sales summary
    getSummary: (params: Record<string, any> = {}) => {
        return apiHelpers.get<any>(ENDPOINTS.SUMMARY, { params });
    },

    // =========================================================================
    // RECEIPTS
    // =========================================================================

    // Get receipt
    getReceipt: (saleId: number | string) => {
        return apiHelpers.get<any>(ENDPOINTS.RECEIPT(saleId));
    },

    // Print receipt
    printReceipt: (saleId: number | string) => {
        return apiHelpers.post<void>(`${ENDPOINTS.BASE}/${saleId}/print`);
    }
};
