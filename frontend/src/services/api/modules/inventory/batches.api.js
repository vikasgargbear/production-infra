/**
 * Batches API Module
 * Handles inventory batch operations
 * 
 * ENDPOINTS: /inventory/batches (backend: app/api/routes/inventory/batches.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
  BASE: '/inventory/batches',
  DETAILS: (id) => `/inventory/batches/${id}`,
  AVAILABLE: (productId) => `/inventory/batches/available/${productId}`,
  EXPIRING: '/inventory/batches/expiring'
};

export const batchesApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all batches
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get batch by ID
  getById: (id) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Get batches by product
  getByProduct: (productId) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params: { product_id: productId } });
  },

  // Create new batch
  create: (data) => {
    return apiHelpers.post(ENDPOINTS.BASE, data);
  },

  // Update batch
  update: (id, data) => {
    return apiHelpers.put(ENDPOINTS.DETAILS(id), data);
  },

  // Delete batch
  delete: (id) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // AVAILABILITY
  // =========================================================================

  // Get available batches for a product (non-expired, with stock)
  getAvailable: (productId) => {
    return apiHelpers.get(ENDPOINTS.AVAILABLE(productId));
  },

  // Get expiring batches
  getExpiring: (days = 30) => {
    return apiHelpers.get(ENDPOINTS.EXPIRING, { params: { days } });
  },

  // =========================================================================
  // QUANTITY
  // =========================================================================

  // Update batch quantity
  updateQuantity: (id, quantity) => {
    return apiHelpers.patch(ENDPOINTS.DETAILS(id), { quantity });
  }
};