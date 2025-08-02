import { useQuery, useMutation, useQueryClient } from 'react-query';
import { productAPI } from '../../../services/api/apiClient';
import { Product } from '../../types/models/product';

interface SearchResponse {
  success: boolean;
  data: Product[];
  total: number;
}

export const useProductSearch = (searchQuery: string, options?: { 
  enabled?: boolean;
  categoryId?: number;
  isNarcotic?: boolean;
}) => {
  return useQuery<SearchResponse>(
    ['products', 'search', searchQuery, options?.categoryId, options?.isNarcotic],
    async () => {
      if (!searchQuery || searchQuery.length < 2) {
        return { success: true, data: [], total: 0 };
      }
      return await productAPI.search(searchQuery, {
        categoryId: options?.categoryId,
        isNarcotic: options?.isNarcotic,
      });
    },
    {
      enabled: options?.enabled !== false && searchQuery.length >= 2,
      staleTime: 30000, // 30 seconds
    }
  );
};

export const useProductDetails = (productId: number | null) => {
  return useQuery(
    ['products', productId],
    () => productAPI.getDetails(productId!),
    {
      enabled: !!productId,
    }
  );
};

export const useProductStock = (productId: number | null, options?: {
  branchId?: number;
  includeReserved?: boolean;
}) => {
  return useQuery(
    ['products', productId, 'stock', options?.branchId],
    () => productAPI.getStock(productId!, options),
    {
      enabled: !!productId,
      refetchInterval: 60000, // Refresh every minute
    }
  );
};