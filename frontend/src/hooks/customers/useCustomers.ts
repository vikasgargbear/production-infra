/**
 * Customer React Query Hooks
 * Type-safe data fetching with caching and optimistic updates
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from 'react-query';
import { customerAPI } from '../../services/api/apiClientExports';
import { useCallback } from 'react';

// Simplified types for our working API
interface Customer {
  customer_id: string;
  customer_name: string;
  primary_phone?: string;
  primary_email?: string;
  customer_type?: string;
  status?: string;
  balance_amount?: number;
}

interface CustomerCreateInput {
  customer_name: string;
  primary_phone?: string;
  primary_email?: string;
  customer_type?: string;
  address?: {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
  };
}

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
 */
export function useCustomerSearch(
  query: string,
  options?: UseQueryOptions<ApiResponse<Customer[]>, unknown, ApiResponse<Customer[]>>
) {
  return useQuery<ApiResponse<Customer[]>>(
    customerKeys.search(query),
    () => customerAPI.search(query),
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
    () => customerAPI.getDetails(customerId),
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