/**
 * Products API Module
 * Handles product CRUD and related operations
 * 
 * ENDPOINTS: /products (backend: app/api/routes/master/products.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

// ============================================================================
// TYPES
// ============================================================================

export interface ProductParams {
  limit?: number;
  offset?: number;
  search?: string;
  category?: string;
  is_active?: boolean;
  low_stock?: boolean;
  threshold?: number;
  expired?: boolean;
  expiring_soon?: boolean;
  days?: number;
}

export interface ProductSyncParams {
  page?: number;
  pageSize?: number;
  since?: string;
  includeInactive?: boolean;
}

// ============================================================================
// API
// ============================================================================

const ENDPOINTS = {
  BASE: '/products',
  DETAILS: (id: number | string) => `/products/${id}`,
  CATEGORIES: '/products/categories',
  BATCH_UPLOAD: '/products/batch-upload',
  STOCK_UPDATE: '/products/stock-update'
} as const;

export const productsApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all products
  getAll: (params: ProductParams = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get product by ID
  getById: (id: number | string) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Create new product
  create: (data: any) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },

  // Update product
  update: (id: number | string, data: any) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
  },

  // Delete product
  delete: (id: number | string) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // SEARCH
  // =========================================================================

  // Search products
  search: (query: string, params: ProductParams = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { search: query, ...params }
    });
  },

  // Search products with embedded batches (OPTIMIZED - single API call)
  searchWithBatches: (query: string, params: any = {}) => {
    return apiHelpers.get('/products/search-with-batches', {
      params: { q: query, ...params }
    });
  },

  // Bulk fetch ALL products with batches for offline sync
  // Usage: getAllWithBatches({ page: 1, pageSize: 100, since: '2026-01-01T00:00:00Z' })
  getAllWithBatches: (params: ProductSyncParams = {}) => {
    return apiHelpers.get('/products/all-with-batches', {
      params: {
        page: params.page || 1,
        page_size: params.pageSize || 100,
        since: params.since || undefined,
        include_inactive: params.includeInactive || false
      }
    });
  },

  // =========================================================================
  // CATEGORIES & TYPES
  // =========================================================================

  // Get product categories
  getCategories: () => {
    return apiHelpers.get(ENDPOINTS.CATEGORIES);
  },

  // Get master categories (alias)
  getMasterCategories: () => {
    return apiHelpers.get('/products/master/categories');
  },

  // Get product types
  getProductTypes: () => {
    return apiHelpers.get('/products/master/types');
  },

  // Create new category
  createCategory: (categoryName: string) => {
    return apiHelpers.post('/products/master/categories', { category_name: categoryName });
  },

  // Create new product type
  createProductType: (typeName: string, defaultBaseUom: string = 'Unit') => {
    return apiHelpers.post('/products/master/types', {
      type_name: typeName,
      default_base_uom: defaultBaseUom
    });
  },

  // =========================================================================
  // STOCK
  // =========================================================================

  // Update stock levels
  updateStock: (productId: number | string, data: any) => {
    return apiHelpers.post(ENDPOINTS.STOCK_UPDATE, {
      product_id: productId,
      ...data
    });
  },

  // Get low stock products
  getLowStock: (threshold: number = 10) => {
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
  getExpiringSoon: (days: number = 30) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { expiring_soon: true, days }
    });
  },

  // =========================================================================
  // BATCH UPLOAD
  // =========================================================================

  // Batch upload products
  batchUpload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiHelpers.post(ENDPOINTS.BATCH_UPLOAD, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};