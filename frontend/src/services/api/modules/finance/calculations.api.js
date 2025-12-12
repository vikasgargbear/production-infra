/**
 * Calculations API Module
 * Server-side calculations for purchase, sales, returns, invoices
 * Single source of truth - frontend never calculates, always calls backend
 * 
 * ENDPOINTS: /calculations (backend: app/api/routes/enterprise_calculations.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    BASE: '/calculations',
    PURCHASE: '/calculations/purchase/totals',
    SALES_ORDER: '/calculations/sales-order/totals',
    INVOICE: '/calculations/invoice/totals',
    CHALLAN: '/calculations/challan/totals',
    SALES_RETURN: '/calculations/sales-return/totals',
    PURCHASE_RETURN: '/calculations/purchase-return/totals'
};

export const calculationsApi = {
    // =========================================================================
    // PURCHASE CALCULATIONS
    // =========================================================================

    // Calculate purchase order/invoice totals
    calculatePurchase: (data) => {
        return apiHelpers.post(ENDPOINTS.PURCHASE, data);
    },

    // =========================================================================
    // SALES CALCULATIONS
    // =========================================================================

    // Calculate sales order totals
    calculateSalesOrder: (data) => {
        return apiHelpers.post(ENDPOINTS.SALES_ORDER, data);
    },

    // Calculate invoice totals
    calculateInvoice: (data) => {
        return apiHelpers.post(ENDPOINTS.INVOICE, data);
    },

    // Calculate challan totals
    calculateChallan: (data) => {
        return apiHelpers.post(ENDPOINTS.CHALLAN, data);
    },

    // =========================================================================
    // RETURN CALCULATIONS
    // =========================================================================

    // Calculate sales return totals
    calculateSalesReturn: (data) => {
        return apiHelpers.post(ENDPOINTS.SALES_RETURN, data);
    },

    // Calculate purchase return totals
    calculatePurchaseReturn: (data) => {
        return apiHelpers.post(ENDPOINTS.PURCHASE_RETURN, data);
    }
};
