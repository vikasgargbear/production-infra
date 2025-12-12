/**
 * Conversions API Module
 * Handles document type conversions (Quote→Order→Invoice→Challan)
 * 
 * ENDPOINTS: /conversions (backend: app/api/routes/conversions.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    BASE: '/conversions',
    QUOTATION_TO_ORDER: '/conversions/quotation-to-order',
    ORDER_TO_INVOICE: '/conversions/order-to-invoice',
    ORDER_TO_CHALLAN: '/conversions/order-to-challan',
    CHALLAN_TO_INVOICE: '/conversions/challan-to-invoice',
    PO_TO_GRN: '/conversions/po-to-grn',
    GRN_TO_INVOICE: '/conversions/grn-to-supplier-invoice'
};

export const conversionsApi = {
    // =========================================================================
    // SALES CONVERSIONS
    // =========================================================================

    // Convert quotation to order
    quotationToOrder: (quotationId, additionalData = {}) => {
        return apiHelpers.post(ENDPOINTS.QUOTATION_TO_ORDER, {
            quotation_id: quotationId,
            ...additionalData
        });
    },

    // Convert order to invoice
    orderToInvoice: (orderId, additionalData = {}) => {
        return apiHelpers.post(ENDPOINTS.ORDER_TO_INVOICE, {
            order_id: orderId,
            ...additionalData
        });
    },

    // Convert order to challan
    orderToChallan: (orderId, additionalData = {}) => {
        return apiHelpers.post(ENDPOINTS.ORDER_TO_CHALLAN, {
            order_id: orderId,
            ...additionalData
        });
    },

    // Convert challan to invoice
    challanToInvoice: (challanId, additionalData = {}) => {
        return apiHelpers.post(ENDPOINTS.CHALLAN_TO_INVOICE, {
            challan_id: challanId,
            ...additionalData
        });
    },

    // =========================================================================
    // PURCHASE CONVERSIONS
    // =========================================================================

    // Convert PO to GRN
    poToGRN: (poId, additionalData = {}) => {
        return apiHelpers.post(ENDPOINTS.PO_TO_GRN, {
            po_id: poId,
            ...additionalData
        });
    },

    // Convert GRN to supplier invoice
    grnToSupplierInvoice: (grnId, additionalData = {}) => {
        return apiHelpers.post(ENDPOINTS.GRN_TO_INVOICE, {
            grn_id: grnId,
            ...additionalData
        });
    },

    // =========================================================================
    // PREVIEW
    // =========================================================================

    // Preview conversion (get data without creating)
    preview: (sourceType, sourceId, targetType) => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/preview`, {
            params: { source_type: sourceType, source_id: sourceId, target_type: targetType }
        });
    }
};
