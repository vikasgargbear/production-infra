/**
 * Customer React Query Hooks
 * Type-safe data fetching with caching and optimistic updates
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from 'react-query';
import { customersApi as customerAPI } from '../../services/api';
import { useCallback } from 'react';
import { Customer, CustomerCreateInput, CustomerSearchParams } from '../../types/models/customer';
import localSearchService from '../../services/offline/search/localSearchService';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

// Query keys factory for better cache management
export const customerKeys = {
  all: ['customers'] as const,
  lists: () => [...customerKeys.all, 'list'] as const,
  list: (params?: CustomerSearchParams) => [...customerKeys.lists(), params] as const,
  details: () => [...customerKeys.all, 'detail'] as const,
  detail: (id: number) => [...customerKeys.details(), id] as const,
  search: (query: string) => [...customerKeys.all, 'search', query] as const,
  transactions: (id: number) => [...customerKeys.all, 'transactions', id] as const,
  creditCheck: (id: number, amount: number) => [...customerKeys.all, 'credit-check', id, amount] as const,
};

/**
 * Hook to search customers (most commonly used)
 * Now with local-first approach for instant results
 */
export function useCustomerSearch(
  query: string,
  options?: UseQueryOptions<ApiResponse<Customer[]>, unknown, ApiResponse<Customer[]>>
) {
  return useQuery<ApiResponse<Customer[]>>(
    customerKeys.search(query),
    async () => {
      // Use local-first service for instant results
      const results = await localSearchService.searchCustomers(query, { limit: 20 });
      return {
        success: true,
        data: results
      };
    },
    {
      enabled: query.length >= 2, // Only search with 2+ characters
      staleTime: 1 * 60 * 1000, // 1 minute
      keepPreviousData: true,
      ...options,
    }
  );
}

/**
 * Hook to fetch single customer details
 */
export function useCustomer(
  customerId: string,
  options?: UseQueryOptions<ApiResponse<Customer>, unknown, ApiResponse<Customer>>
) {
  return useQuery<ApiResponse<Customer>>(
    customerKeys.detail(parseInt(customerId)),
    () => customerAPI.getById(customerId),
    {
      enabled: !!customerId,
      staleTime: 5 * 60 * 1000,
      ...options,
    }
  );
}

/**
 * Hook to create a new customer
 */
export function useCreateCustomer(
  options?: UseMutationOptions<ApiResponse<Customer>, unknown, CustomerCreateInput>
) {
  const queryClient = useQueryClient();

  return useMutation(
    (data: CustomerCreateInput) => customerAPI.create(data),
    {
      onSuccess: (response) => {
        // Invalidate customer queries
        queryClient.invalidateQueries(customerKeys.all);
      },
      ...options,
    }
  );
}