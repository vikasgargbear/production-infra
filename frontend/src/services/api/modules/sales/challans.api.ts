/**
 * Challans API Module
 * Handles delivery challan operations
 * 
 * ENDPOINTS: /challan (backend: app/api/routes/sales/challan.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

// Type definitions
type ChallanId = number | string;

interface ChallanParams {
    skip?: number;
    limit?: number;
    customer_id?: number;
    status?: string;
    from_date?: string;
    to_date?: string;
    [key: string]: unknown;
}

const ENDPOINTS = {
    BASE: '/challan',
    DETAILS: (id: ChallanId) => `/challan/${id}`,
    BY_ORDER: (orderId: number | string) => `/challan/order/${orderId}`,
    BY_CUSTOMER: (customerId: number | string) => `/challan/customer/${customerId}`,
    CONVERT_TO_INVOICE: (id: ChallanId) => `/challan/${id}/convert-to-invoice`,
    UPDATE_STATUS: (id: ChallanId) => `/challan/${id}/status`
};

export const challansApi = {
    // =========================================================================
    // CRUD OPERATIONS
    // =========================================================================

    /** Get all challans */
    getAll: (params: ChallanParams = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    /** Search challans */
    search: (params: ChallanParams = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    /** Get challan by ID */
    getById: (id: ChallanId) => {
        return apiHelpers.get(ENDPOINTS.DETAILS(id));
    },

    /** Create new challan */
    create: (data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
    },

    /** Create challan from order */
    createFromOrder: (orderId: number | string, data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.BASE, { order_id: orderId, ...cleanedData });
    },

    /** Update challan */
    update: (id: ChallanId, data: any) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
    },

    /** Delete challan */
    delete: (id: ChallanId) => {
        return apiHelpers.delete(ENDPOINTS.DETAILS(id));
    },

    // =========================================================================
    // QUERIES
    // =========================================================================

    /** Get challans by order */
    getByOrder: (orderId: number | string) => {
        return apiHelpers.get(ENDPOINTS.BY_ORDER(orderId));
    },

    /** Get challans by customer */
    getByCustomer: (customerId: number | string) => {
        return apiHelpers.get(ENDPOINTS.BY_CUSTOMER(customerId));
    },

    // =========================================================================
    // ACTIONS
    // =========================================================================

    /** Convert challan to invoice */
    convertToInvoice: (id: ChallanId, data: any = {}) => {
        return apiHelpers.post(ENDPOINTS.CONVERT_TO_INVOICE(id), data);
    },

    /** Update challan status */
    updateStatus: (id: ChallanId, status: string) => {
        return apiHelpers.patch(ENDPOINTS.UPDATE_STATUS(id), { status });
    }
};

export default challansApi;
