/**
 * Products API Module
 * Handles product CRUD and related operations
 * 
 * ENDPOINTS: /products (backend: app/api/routes/master/products.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
  BASE: '/products',
  DETAILS: (id) => `/products/${id}`,
  CATEGORIES: '/products/categories',
  BATCH_UPLOAD: '/products/batch-upload',
  STOCK_UPDATE: '/products/stock-update'
};

export const productsApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all products
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Alias for localFirstService compatibility
  list: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get product by ID
  getById: (id) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Create new product
  create: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },

  // Update product
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
  },

  // Delete product
  delete: (id) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // SEARCH
  // =========================================================================

  // Search products
  search: (query, params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { search: query, ...params }
    });
  },

  // Search products with embedded batches (OPTIMIZED - single API call)
  searchWithBatches: (query, params = {}) => {
    return apiHelpers.get('/products/search-with-batches', {
      params: { q: query, ...params }
    });
  },

  // =========================================================================
  // CATEGORIES
  // =========================================================================

  // Get product categories
  getCategories: () => {
    return apiHelpers.get(ENDPOINTS.CATEGORIES);
  },

  // =========================================================================
  // STOCK
  // =========================================================================

  // Update stock levels
  updateStock: (productId, data) => {
    return apiHelpers.post(ENDPOINTS.STOCK_UPDATE, {
      product_id: productId,
      ...data
    });
  },

  // Get low stock products
  getLowStock: (threshold = 10) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { low_stock: true, threshold }
    });
  },

  // Get expired products
  getExpired: () => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { expired: true }
    });
  },

  // Get expiring soon products
  getExpiringSoon: (days = 30) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { expiring_soon: true, days }
    });
  },

  // =========================================================================
  // BATCH UPLOAD
  // =========================================================================

  // Batch upload products
  batchUpload: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiHelpers.post(ENDPOINTS.BATCH_UPLOAD, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};