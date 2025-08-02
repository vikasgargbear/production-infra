/**
 * Product React Query Hooks
 * Type-safe data fetching with caching and optimistic updates
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions, UseMutationOptions } from 'react-query';
import { productService } from '../../services/products/product.service';
import {
  Product,
  ProductCreateInput,
  ProductUpdateInput,
  ProductSearchParams,
  StockUpdateRequest,
  StockCheckResponse,
  ProductCategory,
  ProductBatch,
  ProductWithBatches,
} from '../../types/models/product';
import { ListResponse, SingleResponse, ApiResponse } from '../../types/api/responses';
import { productCreateSchema, productUpdateSchema } from '../../schemas/product.schema';
import { useCallback } from 'react';

// Query keys factory for better cache management
export const productKeys = {
  all: ['products'] as const,
  lists: () => [...productKeys.all, 'list'] as const,
  list: (params?: ProductSearchParams) => [...productKeys.lists(), params] as const,
  details: () => [...productKeys.all, 'detail'] as const,
  detail: (id: number) => [...productKeys.details(), id] as const,
  search: (query: string, params?: any) => [...productKeys.all, 'search', query, params] as const,
  batches: (id: number) => [...productKeys.all, 'batches', id] as const,
  categories: () => [...productKeys.all, 'categories'] as const,
  stockCheck: (id: number, quantity: number) => [...productKeys.all, 'stock-check', id, quantity] as const,
  lowStock: (threshold?: number) => [...productKeys.all, 'low-stock', threshold] as const,
  expiring: (days?: number) => [...productKeys.all, 'expiring', days] as const,
  expired: () => [...productKeys.all, 'expired'] as const,
  priceHistory: (id: number) => [...productKeys.all, 'price-history', id] as const,
};

/**
 * Hook to fetch products with pagination and filtering
 */
export function useProducts(
  params?: ProductSearchParams,
  options?: UseQueryOptions<ListResponse<Product>, unknown, ListResponse<Product>>
) {
  return useQuery<ListResponse<Product>>(
    productKeys.list(params),
    () => productService.getProducts(params),
    {
      keepPreviousData: true, // Keep previous data while fetching new page
      staleTime: 5 * 60 * 1000, // Consider data stale after 5 minutes
      ...options,
    }
  );
}

/**
 * Hook to fetch single product details
 */
export function useProduct(
  productId: number,
  options?: UseQueryOptions<SingleResponse<Product>, unknown, SingleResponse<Product>>
) {
  return useQuery<SingleResponse<Product>>(
    productKeys.detail(productId),
    () => productService.getProduct(productId),
    {
      enabled: !!productId,
      staleTime: 5 * 60 * 1000,
      ...options,
    }
  );
}

/**
 * Hook to fetch product with batches
 */
export function useProductWithBatches(
  productId: number,
  options?: UseQueryOptions<SingleResponse<ProductWithBatches>, unknown, SingleResponse<ProductWithBatches>>
) {
  return useQuery<SingleResponse<ProductWithBatches>>(
    [...productKeys.detail(productId), 'with-batches'],
    () => productService.getProductWithBatches(productId),
    {
      enabled: !!productId,
      staleTime: 2 * 60 * 1000, // 2 minutes - more frequent updates for stock
      ...options,
    }
  );
}

/**
 * Hook for product search (autocomplete)
 */
export function useProductSearch(
  query: string,
  params?: {
    limit?: number;
    category?: string;
    has_stock?: boolean;
  },
  options?: UseQueryOptions<ListResponse<Product>, unknown, ListResponse<Product>>
) {
  return useQuery<ListResponse<Product>>(
    productKeys.search(query, params),
    () => productService.searchProducts(query, params),
    {
      enabled: query.length >= 2, // Only search with 2+ characters
      staleTime: 1 * 60 * 1000, // 1 minute
      ...options,
    }
  );
}

/**
 * Hook to fetch product categories
 */
export function useProductCategories(
  options?: UseQueryOptions<ListResponse<ProductCategory>, unknown, ListResponse<ProductCategory>>
) {
  return useQuery<ListResponse<ProductCategory>>(
    productKeys.categories(),
    () => productService.getCategories(),
    {
      staleTime: 30 * 60 * 1000, // 30 minutes - categories don't change often
      ...options,
    }
  );
}

/**
 * Hook to fetch product batches
 */
export function useProductBatches(
  productId: number,
  params?: {
    active_only?: boolean;
    non_expired?: boolean;
    page?: number;
    page_size?: number;
  },
  options?: UseQueryOptions<ListResponse<ProductBatch>, unknown, ListResponse<ProductBatch>>
) {
  return useQuery<ListResponse<ProductBatch>>(
    [...productKeys.batches(productId), params],
    () => productService.getProductBatches(productId, params),
    {
      enabled: !!productId,
      staleTime: 2 * 60 * 1000,
      ...options,
    }
  );
}

/**
 * Hook to create a new product
 */
export function useCreateProduct(
  options?: UseMutationOptions<SingleResponse<Product>, unknown, ProductCreateInput>
) {
  const queryClient = useQueryClient();
  
  return useMutation(
    async (data: ProductCreateInput) => {
      // Validate data before sending
      const validation = productCreateSchema.safeParse(data);
      if (!validation.success) {
        throw new Error(validation.error.errors[0].message);
      }
      
      return productService.createProduct(data);
    },
    {
      onSuccess: (response) => {
        // Invalidate and refetch product lists
        queryClient.invalidateQueries(productKeys.lists());
        
        // Add the new product to cache
        if (response.success && response.data) {
          queryClient.setQueryData(
            productKeys.detail(response.data.product_id),
            response
          );
        }
      },
      ...options,
    }
  );
}

/**
 * Hook to update a product
 */
export function useUpdateProduct(
  options?: UseMutationOptions<SingleResponse<Product>, unknown, { id: number; data: ProductUpdateInput }>
) {
  const queryClient = useQueryClient();
  
  return useMutation<SingleResponse<Product>, unknown, { id: number; data: ProductUpdateInput }>(
    async ({ id, data }) => {
      // Validate data before sending
      const validation = productUpdateSchema.safeParse(data);
      if (!validation.success) {
        throw new Error(validation.error.errors[0].message);
      }
      
      return productService.updateProduct(id, data);
    },
    {
      onMutate: async ({ id, data }) => {
        // Cancel any outgoing refetches
        await queryClient.cancelQueries(productKeys.detail(id));
        
        // Snapshot previous value
        const previousProduct = queryClient.getQueryData(productKeys.detail(id));
        
        // Optimistically update
        queryClient.setQueryData(productKeys.detail(id), (old: any) => ({
          ...old,
          data: { ...old?.data, ...data },
        }));
        
        return { previousProduct };
      },
      onError: (err, variables, context: any) => {
        // Rollback on error
        if (context?.previousProduct) {
          queryClient.setQueryData(
            productKeys.detail(variables.id),
            context.previousProduct
          );
        }
      },
      onSettled: (data, error, variables) => {
        // Always refetch after error or success
        queryClient.invalidateQueries(productKeys.detail(variables.id));
        queryClient.invalidateQueries(productKeys.lists());
      },
      ...options,
    }
  );
}

/**
 * Hook to check product stock
 */
export function useCheckProductStock() {
  return useMutation<
    ApiResponse<StockCheckResponse>,
    unknown,
    { productId: number; requiredQuantity: number }
  >(
    ({ productId, requiredQuantity }) => 
      productService.checkStock(productId, requiredQuantity),
    {
      // Don't cache stock checks as they're real-time
    }
  );
}

/**
 * Hook to update product stock
 */
export function useUpdateProductStock(
  options?: UseMutationOptions<ApiResponse<{ new_quantity: number; transaction_id: number }>, unknown, StockUpdateRequest>
) {
  const queryClient = useQueryClient();
  
  return useMutation(
    (request: StockUpdateRequest) => productService.updateStock(request),
    {
      onSuccess: (response, variables) => {
        // Invalidate product details and lists
        queryClient.invalidateQueries(productKeys.detail(variables.product_id));
        queryClient.invalidateQueries(productKeys.batches(variables.product_id));
        queryClient.invalidateQueries(productKeys.lists());
        
        // Also invalidate low stock queries
        queryClient.invalidateQueries(productKeys.lowStock());
      },
      ...options,
    }
  );
}

/**
 * Hook to get low stock products
 */
export function useLowStockProducts(
  params?: {
    threshold?: number;
    category?: string;
    page?: number;
    page_size?: number;
  },
  options?: UseQueryOptions<ListResponse<Product>, unknown, ListResponse<Product>>
) {
  return useQuery<ListResponse<Product>>(
    [...productKeys.lowStock(params?.threshold), params],
    () => productService.getLowStockProducts(params),
    {
      staleTime: 5 * 60 * 1000,
      ...options,
    }
  );
}

/**
 * Hook to get expiring products
 */
export function useExpiringProducts(
  params?: {
    days?: number;
    category?: string;
    page?: number;
    page_size?: number;
  },
  options?: UseQueryOptions<ListResponse<Product>, unknown, ListResponse<Product>>
) {
  return useQuery<ListResponse<Product>>(
    [...productKeys.expiring(params?.days), params],
    () => productService.getExpiringProducts(params),
    {
      staleTime: 15 * 60 * 1000, // 15 minutes
      ...options,
    }
  );
}

/**
 * Custom hook for product selection with stock check
 */
export function useProductSelection() {
  const queryClient = useQueryClient();
  const checkStock = useCheckProductStock();
  
  const selectProduct = useCallback(
    async (productId: number, requiredQuantity?: number) => {
      // Get product from cache or fetch
      let productData = queryClient.getQueryData<SingleResponse<Product>>(
        productKeys.detail(productId)
      );
      
      if (!productData) {
        productData = await queryClient.fetchQuery(
          productKeys.detail(productId),
          () => productService.getProduct(productId)
        );
      }
      
      // Check stock if quantity provided
      if (requiredQuantity && productData?.data) {
        const stockCheck = await checkStock.mutateAsync({
          productId,
          requiredQuantity,
        });
        
        return {
          product: productData.data,
          stockCheck: stockCheck.data,
        };
      }
      
      return {
        product: productData?.data || null,
        stockCheck: null,
      };
    },
    [queryClient, checkStock]
  );
  
  return { selectProduct, isChecking: checkStock.isLoading };
}

/**
 * Hook to validate HSN code
 */
export function useValidateHSN() {
  return useMutation(
    (hsnCode: string) => productService.validateHSN(hsnCode)
  );
}