/**
 * Returns API Module
 * Handles sale returns and purchase returns
 * 
 * ENDPOINTS: 
 *   - /sale-returns (backend: app/api/routes/sales/returns.py)
 *   - /purchase-returns (backend: app/api/routes/purchase/returns.py)
 */

import { apiHelpers } from '../../apiClient';
import { API_CONFIG } from '../../../../config/api.config';
import { cleanData } from '../../utils/dataUtils';

// Type definitions
type ReturnId = number | string;

interface ReturnParams {
    skip?: number;
    limit?: number;
    customer_id?: number;
    supplier_id?: number;
    status?: string;
    from_date?: string;
    to_date?: string;
    [key: string]: unknown;
}

const ENDPOINTS = API_CONFIG.ENDPOINTS.RETURNS;

export const returnsApi = {
    // =========================================================================
    // SALE RETURNS
    // =========================================================================

    /** Get all sale returns */
    getSaleReturns: (params: ReturnParams = {}) => {
        return apiHelpers.get(ENDPOINTS.SALES, { params });
    },

    /** Create sale return */
    createSaleReturn: (data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.SALES, cleanedData);
    },

    /** Get returnable invoices (for sale returns) */
    getReturnableInvoices: (params: ReturnParams = {}) => {
        return apiHelpers.get(`${ENDPOINTS.SALES}returnable-invoices`, { params });
    },

    /** Get returns for a specific invoice */
    getReturnsForInvoice: (invoiceId: number | string) => {
        return apiHelpers.get(`${ENDPOINTS.SALES}invoice/${invoiceId}/returns`);
    },

    // =========================================================================
    // PURCHASE RETURNS
    // =========================================================================

    /** Get all purchase returns */
    getPurchaseReturns: (params: ReturnParams = {}) => {
        return apiHelpers.get(ENDPOINTS.PURCHASE, { params });
    },

    /** Create purchase return */
    createPurchaseReturn: (data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.PURCHASE, cleanedData);
    },

    /** Get returnable purchases */
    getReturnablePurchases: (params: ReturnParams = {}) => {
        return apiHelpers.get(`${ENDPOINTS.PURCHASE}returnable-purchases/`, { params });
    },

    /** Get purchase items for return */
    getPurchaseItems: (purchaseId: number | string) => {
        return apiHelpers.get(`${ENDPOINTS.PURCHASE}purchase/${purchaseId}/items`);
    },

    /** Get supplier invoice items for return */
    getSupplierInvoiceReturnableItems: (invoiceId: number | string) => {
        return apiHelpers.get(`${ENDPOINTS.PURCHASE}supplier-invoice/${invoiceId}/returnable-items`);
    },

    // =========================================================================
    // COMMON OPERATIONS
    // =========================================================================

    /** Get all returns (both types) */
    getAll: (params: ReturnParams = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    /** Get return by ID */
    getById: (id: ReturnId) => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${id}`);
    },

    /** Update return */
    update: (id: ReturnId, data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put(`${ENDPOINTS.BASE}/${id}`, cleanedData);
    },

    /** Delete return */
    delete: (id: ReturnId) => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/${id}`);
    },

    /** Approve return */
    approve: (id: ReturnId) => {
        return apiHelpers.post(ENDPOINTS.APPROVE(id));
    },

    /** Reject return */
    reject: (id: ReturnId, reason: string) => {
        return apiHelpers.post(ENDPOINTS.REJECT(id), { reason });
    },

};

export default returnsApi;
