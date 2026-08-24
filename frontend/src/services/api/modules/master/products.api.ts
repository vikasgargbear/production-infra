/**
 * Products API Module
 * Handles product CRUD and related operations
 *
 * ENDPOINTS: /products (backend: app/api/routes/master/products.py)
 */

import { apiHelpers } from '../../apiClient';
import { createCrudApi } from '../../utils/createCrudApi';
import {
  productCreateSchema,
  productUpdateSchema,
  ProductCreateInput,
  ProductMutationResponse,
  ProductUpdateInput,
} from '../../../../types/models/product';
import type { AxiosResponse } from 'axios';

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
  include_inactive?: boolean;
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

const crud = createCrudApi({ basePath: '/products', createPath: '/products/' });

export const productsApi = {
  ...crud,

  create: (data: ProductCreateInput): Promise<AxiosResponse<ProductMutationResponse>> => {
    return apiHelpers.post('/products/', productCreateSchema.parse(data));
  },

  update: (
    productId: number | string,
    data: ProductUpdateInput,
  ): Promise<AxiosResponse<ProductMutationResponse>> => {
    return apiHelpers.put(`/products/${productId}`, productUpdateSchema.parse(data));
  },

  // Search products
  search: (query: string, params: ProductParams = {}) => {
    return apiHelpers.get('/products', {
      params: { search: query, ...params }
    });
  },

  // Search products with embedded batches (OPTIMIZED - single API call)
  searchWithBatches: (query: string, params: any = {}) => {
    return apiHelpers.get('/products/search-with-batches', {
      params: { q: query, ...params }
    });
  },

  // Bulk product/batch read for canonical reporting consumers
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

  // Categories & Types
  getCategories: () => {
    return apiHelpers.get('/products/categories');
  },

  getMasterCategories: () => {
    return apiHelpers.get('/products/master/categories');
  },

  getProductTypes: () => {
    return apiHelpers.get('/products/master/types');
  },

  createCategory: (categoryName: string) => {
    return apiHelpers.post('/products/master/categories', { category_name: categoryName });
  },

  createProductType: (typeName: string, defaultBaseUom: string = 'Unit') => {
    return apiHelpers.post('/products/master/types', {
      type_name: typeName,
      default_base_uom: defaultBaseUom
    });
  },

  // Stock
  updateStock: (productId: number | string, data: any) => {
    return apiHelpers.post('/products/stock-update', {
      product_id: productId,
      ...data
    });
  },

  getLowStock: (threshold: number = 10) => {
    return apiHelpers.get('/products', {
      params: { low_stock: true, threshold }
    });
  },

  getExpired: () => {
    return apiHelpers.get('/products', {
      params: { expired: true }
    });
  },

  getExpiringSoon: (days: number = 30) => {
    return apiHelpers.get('/products', {
      params: { expiring_soon: true, days }
    });
  },

  // Batch Upload
  batchUpload: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiHelpers.post('/products/batch-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};
