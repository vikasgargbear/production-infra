/**
 * Challans API Module
 * Handles delivery challan operations
 * 
 * ENDPOINTS: /challan (backend: app/api/routes/sales/challan.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
  BASE: '/challan',
  DETAILS: (id) => `/challan/${id}`,
  BY_ORDER: (orderId) => `/challan/order/${orderId}`,
  BY_CUSTOMER: (customerId) => `/challan/customer/${customerId}`,
  CONVERT_TO_INVOICE: (id) => `/challan/${id}/convert-to-invoice`,
  UPDATE_STATUS: (id) => `/challan/${id}/status`
};

export const challansApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all challans
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Search challans
  search: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get challan by ID
  getById: (id) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Create new challan
  create: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },

  // Create challan from order
  createFromOrder: (orderId, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, { order_id: orderId, ...cleanedData });
  },

  // Update challan
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
  },

  // Delete challan
  delete: (id) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // QUERIES
  // =========================================================================

  // Get challans by order
  getByOrder: (orderId) => {
    return apiHelpers.get(ENDPOINTS.BY_ORDER(orderId));
  },

  // Get challans by customer
  getByCustomer: (customerId) => {
    return apiHelpers.get(ENDPOINTS.BY_CUSTOMER(customerId));
  },

  // =========================================================================
  // ACTIONS
  // =========================================================================

  // Convert challan to invoice
  convertToInvoice: (id, data = {}) => {
    return apiHelpers.post(ENDPOINTS.CONVERT_TO_INVOICE(id), data);
  },

  // Update challan status
  updateStatus: (id, status) => {
    return apiHelpers.patch(ENDPOINTS.UPDATE_STATUS(id), { status });
  }
};