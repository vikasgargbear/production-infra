/**
 * Customer React Query Hooks
 * Type-safe data fetching with caching and optimistic updates
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from 'react-query';
import { customerService } from '../../services/customers/customer.service';
import {
  Customer,
  CustomerCreateInput,
  CustomerUpdateInput,
  CustomerSearchParams,
  CreditCheckRequest,
  CreditCheckResponse,
} from '../../types/models/customer';
import { ListResponse, SingleResponse, ApiResponse } from '../../types/api/responses';
import { customerCreateSchema, customerUpdateSchema } from '../../schemas/customer.schema';
import { useCallback } from 'react';

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
 * Hook to fetch customers with pagination and filtering
 */
export function useCustomers(
  params?: CustomerSearchParams,
  options?: UseQueryOptions<ListResponse<Customer>, unknown, ListResponse<Customer>>
) {
  return useQuery<ListResponse<Customer>>(
    customerKeys.list(params),
    () => customerService.getCustomers(params),
    {
      keepPreviousData: true, // Keep previous data while fetching new page
      staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
      ...options,
    }
  );
}

/**
 * Hook to fetch single customer details
 */
export function useCustomer(
  customerId: number,
  options?: UseQueryOptions<SingleResponse<Customer>, unknown, SingleResponse<Customer>>
) {
  return useQuery<SingleResponse<Customer>>(
    customerKeys.detail(customerId),
    () => customerService.getCustomer(customerId),
    {
      enabled: !!customerId,
      staleTime: 5 * 60 * 1000,
      ...options,
    }
  );
}

/**
 * Hook for customer search (autocomplete)
 */
export function useCustomerSearch(
  query: string,
  options?: UseQueryOptions<ListResponse<Customer>, unknown, ListResponse<Customer>>
) {
  return useQuery<ListResponse<Customer>>(
    customerKeys.search(query),
    () => customerService.searchCustomers(query),
    {
      enabled: query.length >= 2, // Only search with 2+ characters
      staleTime: 1 * 60 * 1000, // 1 minute
      ...options,
    }
  );
}

/**
 * Hook to create a new customer
 */
export function useCreateCustomer(
  options?: UseMutationOptions<SingleResponse<Customer>, unknown, CustomerCreateInput>
) {
  const queryClient = useQueryClient();
  
  return useMutation(
    async (data: CustomerCreateInput) => {
      // Validate data before sending
      const validation = customerCreateSchema.safeParse(data);
      if (!validation.success) {
        throw new Error(validation.error.errors[0].message);
      }
      
      return customerService.createCustomer(data);
    },
    {
      onSuccess: (response) => {
        // Invalidate and refetch customer lists
        queryClient.invalidateQueries(customerKeys.lists());
        
        // Add the new customer to cache
        if (response.success && response.data) {
          queryClient.setQueryData(
            customerKeys.detail(response.data.customer_id),
            response
          );
        }
      },
      ...options,
    }
  );
}

/**
 * Hook to update a customer
 */
export function useUpdateCustomer(
  options?: UseMutationOptions<SingleResponse<Customer>, unknown, { id: number; data: CustomerUpdateInput }>
) {
  const queryClient = useQueryClient();
  
  return useMutation<SingleResponse<Customer>, unknown, { id: number; data: CustomerUpdateInput }>(
    async ({ id, data }) => {
      // Validate data before sending
      const validation = customerUpdateSchema.safeParse(data);
      if (!validation.success) {
        throw new Error(validation.error.errors[0].message);
      }
      
      return customerService.updateCustomer(id, data);
    },
    {
      onMutate: async ({ id, data }) => {
        // Cancel any outgoing refetches
        await queryClient.cancelQueries(customerKeys.detail(id));
        
        // Snapshot previous value
        const previousCustomer = queryClient.getQueryData(customerKeys.detail(id));
        
        // Optimistically update
        queryClient.setQueryData(customerKeys.detail(id), (old: any) => ({
          ...old,
          data: { ...old?.data, ...data },
        }));
        
        return { previousCustomer };
      },
      onError: (err, variables, context: any) => {
        // Rollback on error
        if (context?.previousCustomer) {
          queryClient.setQueryData(
            customerKeys.detail(variables.id),
            context.previousCustomer
          );
        }
      },
      onSettled: (data, error, variables) => {
        // Always refetch after error or success
        queryClient.invalidateQueries(customerKeys.detail(variables.id));
        queryClient.invalidateQueries(customerKeys.lists());
      },
      ...options,
    }
  );
}

/**
 * Hook to check customer credit
 */
export function useCheckCustomerCredit() {
  return useMutation<
    ApiResponse<CreditCheckResponse>,
    unknown,
    CreditCheckRequest
  >(
    (request) => customerService.checkCredit(request),
    {
      // Don't cache credit checks as they're real-time
    }
  );
}

/**
 * Hook to get customer transactions
 */
export function useCustomerTransactions(
  customerId: number,
  params?: {
    from_date?: string;
    to_date?: string;
    page?: number;
    page_size?: number;
  }
) {
  return useQuery(
    [...customerKeys.transactions(customerId), params],
    () => customerService.getCustomerTransactions(customerId, params),
    {
      enabled: !!customerId,
      keepPreviousData: true,
    }
  );
}

/**
 * Hook to validate GST number
 */
export function useValidateGST() {
  return useMutation(
    (gstNumber: string) => customerService.validateGST(gstNumber)
  );
}

/**
 * Custom hook for customer selection with credit check
 */
export function useCustomerSelection() {
  const queryClient = useQueryClient();
  const checkCredit = useCheckCustomerCredit();
  
  const selectCustomer = useCallback(
    async (customerId: number, orderAmount?: number) => {
      // Get customer from cache or fetch
      let customerData = queryClient.getQueryData<SingleResponse<Customer>>(
        customerKeys.detail(customerId)
      );
      
      if (!customerData) {
        customerData = await queryClient.fetchQuery(
          customerKeys.detail(customerId),
          () => customerService.getCustomer(customerId)
        );
      }
      
      // Check credit if amount provided
      if (orderAmount && customerData?.data) {
        const creditCheck = await checkCredit.mutateAsync({
          customer_id: customerId,
          order_amount: orderAmount,
        });
        
        return {
          customer: customerData.data,
          creditCheck: creditCheck.data,
        };
      }
      
      return {
        customer: customerData?.data || null,
        creditCheck: null,
      };
    },
    [queryClient, checkCredit]
  );
  
  return { selectCustomer, isChecking: checkCredit.isLoading };
}