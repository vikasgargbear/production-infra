/**
 * Order Items API Module
 * Handles order item operations
 * 
 * ENDPOINTS: /order-items (backend: handled within orders routes)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
  BASE: '/order-items',
  DETAILS: (id) => `/order-items/${id}`,
  BY_ORDER: (orderId) => `/orders/${orderId}/items`
};

export const orderItemsApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all order items
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get order item by ID
  getById: (id) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Get items by order ID
  getByOrderId: (orderId) => {
    return apiHelpers.get(ENDPOINTS.BY_ORDER(orderId));
  },

  // Create new order item
  create: (data) => {
    return apiHelpers.post(ENDPOINTS.BASE, data);
  },

  // Update order item
  update: (id, data) => {
    return apiHelpers.put(ENDPOINTS.DETAILS(id), data);
  },

  // Delete order item
  delete: (id) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // BULK OPERATIONS
  // =========================================================================

  // Bulk create order items
  bulkCreate: (items) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/bulk`, { items });
  },

  // Update multiple order items
  bulkUpdate: (updates) => {
    return apiHelpers.put(`${ENDPOINTS.BASE}/bulk`, { updates });
  }
};