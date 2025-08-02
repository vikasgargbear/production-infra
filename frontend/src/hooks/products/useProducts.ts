/**
 * Product React Query Hooks
 * Type-safe data fetching with caching and optimistic updates
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from 'react-query';
import { productAPI } from '../../services/api/apiClientExports';
import { useCallback } from 'react';

// Simplified types for our working API
interface Product {
  product_id: string;
  product_name: string;
  manufacturer?: string;
  category?: string;
  unit?: string;
  mrp?: number;
  sale_price?: number;
  purchase_price?: number;
  stock_quantity?: number;
  reorder_level?: number;
  is_narcotic?: boolean;
  status?: string;
}

interface ProductCreateInput {
  product_name: string;
  manufacturer?: string;
  category?: string;
  unit?: string;
  mrp?: number;
  sale_price?: number;
  purchase_price?: number;
  reorder_level?: number;
  is_narcotic?: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Query keys factory for better cache management
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (params?: any) => [...productKeys.lists(), params] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: string) => [...productKeys.details(), id] as const,
  search: (query: string, params?: any) => [...productKeys.all, 'search', query, params] as const,
  batches: (id: string) => [...productKeys.all, 'batches', id] as const,
};

/**
 * Hook for product search (most commonly used)
 */
export function useProductSearch(
  query: string,
  params?: {
    limit?: number;
    category?: string;
    manufacturer?: string;
  },
  options?: UseQueryOptions<ApiResponse<Product[]>, unknown, ApiResponse<Product[]>>
) {
  return useQuery<ApiResponse<Product[]>>(
    productKeys.search(query, params),
    () => productAPI.search(query, { 
      limit: params?.limit || 50,
      category: params?.category,
      manufacturer: params?.manufacturer
    }),
    {
      enabled: query.length >= 2, // Only search with 2+ characters
      staleTime: 1 * 60 * 1000, // 1 minute
      keepPreviousData: true,
      ...options,
    }
  );
}

/**
 * Hook to fetch single product details
 */
export function useProduct(
  productId: string,
  options?: UseQueryOptions<ApiResponse<Product>, unknown, ApiResponse<Product>>
) {
  return useQuery<ApiResponse<Product>>(
    productKeys.detail(productId),
    () => productAPI.getDetails(productId),
    {
      enabled: !!productId,
      staleTime: 5 * 60 * 1000,
      ...options,
    }
  );
}

/**
 * Hook to create a new product
 */
export function useCreateProduct(
  options?: UseMutationOptions<ApiResponse<Product>, unknown, ProductCreateInput>
) {
  const queryClient = useQueryClient();
  
  return useMutation(
    (data: ProductCreateInput) => productAPI.create(data),
    {
      onSuccess: (response) => {
        // Invalidate product queries
        queryClient.invalidateQueries(productKeys.all);
      },
      ...options,
    }
  );
}

/**
 * Hook to get product batches
 */
export function useProductBatches(
  productId: string,
  options?: UseQueryOptions<any, unknown, any>
) {
  return useQuery(
    productKeys.batches(productId),
    () => productAPI.getBatches(productId),
    {
      enabled: !!productId,
      staleTime: 2 * 60 * 1000, // 2 minutes
      ...options,
    }
  );
}