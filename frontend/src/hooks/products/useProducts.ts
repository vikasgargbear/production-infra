/**
 * Product React Query Hooks
 * Type-safe data fetching with caching and optimistic updates
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from '@tanstack/react-query';
import { productsApi as productsApi, batchesApi } from '../../services/api';
import { useCallback } from 'react';
import { Product, ProductCreateInput } from '../../types/models/product';

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
  return useQuery<ApiResponse<Product[]>>({
    queryKey: productKeys.search(query, params),
    queryFn: async () => {
      const response = await productsApi.search(query, {
        limit: params?.limit || 50,
        category: params?.category
      });
      return (response as any).data || response;
    },
    enabled: query.length >= 2, // Only search with 2+ characters
    staleTime: 1 * 60 * 1000, // 1 minute
    placeholderData: (previousData) => previousData,
    ...options,
  });
}

/**
 * Hook to fetch single product details
 */
export function useProduct(
  productId: string,
  options?: UseQueryOptions<ApiResponse<Product>, unknown, ApiResponse<Product>>
) {
  return useQuery<ApiResponse<Product>>({
    queryKey: productKeys.detail(productId),
    queryFn: async () => {
      const response = await productsApi.getById(productId);
      return (response as any).data || response;
    },
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
    ...options,
  });
}

/**
 * Hook to create a new product
 */
export function useCreateProduct(
  options?: UseMutationOptions<ApiResponse<Product>, unknown, ProductCreateInput>
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ProductCreateInput) => {
      const response = await productsApi.create(data);
      return (response as any).data || response;
    },
    onSuccess: (response) => {
      // Invalidate product queries
      queryClient.invalidateQueries({ queryKey: productKeys.all });
    },
    ...options,
  });
}

/**
 * Hook to get product batches
 */
export function useProductBatches(
  productId: string,
  options?: any
) {
  return useQuery({
    queryKey: productKeys.batches(productId),
    queryFn: async () => {
      const response = await batchesApi.getByProduct(parseInt(productId));
      return (response as any).data || response;
    },
    enabled: !!productId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    ...options,
  });
}