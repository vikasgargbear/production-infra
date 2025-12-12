/**
 * Inventory Movements API Module
 * Handles stock movement tracking
 * 
 * ENDPOINTS: /stock-movements (backend: app/api/routes/inventory/movements.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
  BASE: '/stock-movements',
  DETAILS: (id) => `/stock-movements/${id}`,
  BY_PRODUCT: (productId) => `/stock-movements/product/${productId}`,
  BY_BATCH: (batchId) => `/stock-movements/batch/${batchId}`
};

export const inventoryMovementsApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all inventory movements
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get movement by ID
  getById: (id) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Create new movement
  create: (data) => {
    return apiHelpers.post(ENDPOINTS.BASE, data);
  },

  // Update movement
  update: (id, data) => {
    return apiHelpers.put(ENDPOINTS.DETAILS(id), data);
  },

  // Delete movement
  delete: (id) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // FILTERS
  // =========================================================================

  // Get movements by product
  getByProduct: (productId) => {
    return apiHelpers.get(ENDPOINTS.BY_PRODUCT(productId));
  },

  // Get movements by batch
  getByBatch: (batchId) => {
    return apiHelpers.get(ENDPOINTS.BY_BATCH(batchId));
  },

  // Get movements by type
  getByType: (type) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params: { movement_type: type } });
  },

  // Get movements in date range
  getByDateRange: (startDate, endDate) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { start_date: startDate, end_date: endDate }
    });
  }
};