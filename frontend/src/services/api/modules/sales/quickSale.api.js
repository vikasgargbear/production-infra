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
    RECEIPT: (id) => `/quick-sale/${id}/receipt`,
    TODAY: '/quick-sale/today',
    SUMMARY: '/quick-sale/summary'
};

export const quickSaleApi = {
    // =========================================================================
    // SALE OPERATIONS
    // =========================================================================

    // Create quick sale
    create: (data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.CREATE, cleanedData);
    },

    // Complete sale (finalize payment)
    complete: (saleId, paymentData) => {
        return apiHelpers.post(ENDPOINTS.COMPLETE, { sale_id: saleId, ...paymentData });
    },

    // Void sale
    void: (saleId, reason) => {
        return apiHelpers.post(ENDPOINTS.VOID, { sale_id: saleId, reason });
    },

    // =========================================================================
    // QUERIES
    // =========================================================================

    // Get sale by ID
    getById: (id) => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${id}`);
    },

    // Get today's sales
    getToday: () => {
        return apiHelpers.get(ENDPOINTS.TODAY);
    },

    // Get sales summary
    getSummary: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.SUMMARY, { params });
    },

    // =========================================================================
    // RECEIPTS
    // =========================================================================

    // Get receipt
    getReceipt: (saleId) => {
        return apiHelpers.get(ENDPOINTS.RECEIPT(saleId));
    },

    // Print receipt
    printReceipt: (saleId) => {
        return apiHelpers.post(`${ENDPOINTS.BASE}/${saleId}/print`);
    }
};
