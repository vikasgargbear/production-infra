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
  ProductHsnOption,
  ProductIngredientOption,
  ProductMutationResponse,
  ProductSetupInput,
  ProductSetupOptions,
  ProductSetupRead,
  ProductUpdateInput,
  productSetupSchema,
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

  getSetupOptions: (manufacturerSearch = '') => apiHelpers.get<ProductSetupOptions>(
    '/products/setup-options',
    { params: { manufacturer_search: manufacturerSearch } },
  ),

  searchIngredients: (search: string) => apiHelpers.get<ProductIngredientOption[]>(
    '/products/setup-options/ingredients',
    { params: { search, limit: 20 } },
  ),

  searchHsnCodes: (search: string) => apiHelpers.get<ProductHsnOption[]>(
    '/products/setup-options/hsn',
    { params: { search, limit: 20 } },
  ),

  getSetup: (productId: number | string) => apiHelpers.get<ProductSetupRead>(
    `/products/${productId}/setup`,
  ),

  saveSetup: (productId: number | string, data: ProductSetupInput) => (
    apiHelpers.put<ProductMutationResponse>(
      `/products/${productId}/setup`,
      productSetupSchema.parse(data),
    )
  ),

  activate: (
    productId: number | string,
    rowVersion: number,
    idempotencyKey: string,
    manufacturerTraceabilityCode?: string,
  ) => apiHelpers.post<ProductMutationResponse>(
    `/products/${productId}/activate`,
    {
      row_version: rowVersion,
      ...(manufacturerTraceabilityCode ? { manufacturer_traceability_code: manufacturerTraceabilityCode } : {}),
    },
    masterCreateRequestConfig(idempotencyKey),
  ),

  delete: (productId: number | string, rowVersion: number) => {
    return apiHelpers.delete(`/products/${productId}`, {
      params: { row_version: rowVersion },
    });
  },

  // Search products
  search: (query: string, params: ProductParams = {}) => {
    return apiHelpers.get('/products', {
      params: { search: query, ...params },
      preserveExactDecimals: true,
    }).then(response => ({ ...response, data: decodeCanonicalProductList(response.data).products }));
  },
};
