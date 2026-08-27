/**
 * Products API Module
 * Handles product CRUD and related operations
 *
 * ENDPOINTS: /products (backend: app/api/routes/master/products.py)
 */

import { apiHelpers } from '../../apiClient';
import {
  productCreateSchema,
  productUpdateSchema,
  ProductCreateInput,
  ProductMutationResponse,
  ProductUpdateInput,
} from '../../../../types/models/product';
import type { AxiosResponse } from 'axios';
import { decodeCanonicalProductList } from './canonicalMasterReads';
import {
  decodeCanonicalProductDraftCreateResponse,
  masterCreateRequestConfig,
} from './masterCreationContract';

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

export const productsApi = {
  getAll: (params: ProductParams = {}) => apiHelpers.get('/products', { params })
    .then(response => ({ ...response, data: decodeCanonicalProductList(response.data) })),

  create: (
    data: ProductCreateInput,
    idempotencyKey: string,
  ): Promise<AxiosResponse<ProductMutationResponse>> => {
    return apiHelpers.post<ProductMutationResponse>(
      '/products/',
      productCreateSchema.parse(data),
      masterCreateRequestConfig(idempotencyKey),
    ).then(response => ({
      ...response,
      data: decodeCanonicalProductDraftCreateResponse(response.data),
    }));
  },

  update: (
    productId: number | string,
    data: ProductUpdateInput,
  ): Promise<AxiosResponse<ProductMutationResponse>> => {
    return apiHelpers.put(`/products/${productId}`, productUpdateSchema.parse(data));
  },

  delete: (productId: number | string, rowVersion: number) => {
    return apiHelpers.delete(`/products/${productId}`, {
      params: { row_version: rowVersion },
    });
  },

  // Search products
  search: (query: string, params: ProductParams = {}) => {
    return apiHelpers.get('/products', {
      params: { search: query, ...params }
    }).then(response => ({ ...response, data: decodeCanonicalProductList(response.data).products }));
  },
};
