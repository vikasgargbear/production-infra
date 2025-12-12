/**
 * Orders API Module
 * Handles order CRUD and actions
 * 
 * ENDPOINTS: /orders (backend: app/api/routes/sales/orders.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
  BASE: '/orders',
  DETAILS: (id) => `/orders/${id}`,
  ITEMS: (id) => `/orders/${id}/items`,
  CONFIRM: (id) => `/orders/${id}/confirm`,
  CANCEL: (id) => `/orders/${id}/cancel`,
  GENERATE_INVOICE: (id) => `/orders/${id}/generate-invoice`
};

export const ordersApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all orders
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get order by ID
  getById: (id) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Create new order
  create: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },

  // Update order
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
  },

  // Delete order
  delete: (id) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // ORDER ACTIONS
  // =========================================================================

  // Confirm order
  confirm: (id) => {
    return apiHelpers.post(ENDPOINTS.CONFIRM(id));
  },

  // Cancel order
  cancel: (id, reason = '') => {
    return apiHelpers.post(ENDPOINTS.CANCEL(id), { reason });
  },

  // Generate invoice from order
  generateInvoice: (id, data = {}) => {
    return apiHelpers.post(ENDPOINTS.GENERATE_INVOICE(id), data);
  },

  // =========================================================================
  // SEARCH & ITEMS
  // =========================================================================

  // Search orders
  search: (query, params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { search: query, ...params }
    });
  },

  // Get order items
  getItems: (orderId) => {
    return apiHelpers.get(ENDPOINTS.ITEMS(orderId));
  }
};