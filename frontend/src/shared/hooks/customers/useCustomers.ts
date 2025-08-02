import { useQuery, useMutation, useQueryClient } from 'react-query';
import { customerAPI } from '../../../services/api/apiClient';
import { Customer } from '../../types/models/customer';

interface SearchResponse {
  success: boolean;
  data: Customer[];
  total: number;
}

export const useCustomerSearch = (searchQuery: string, options?: { enabled?: boolean }) => {
  return useQuery<SearchResponse>(
    ['customers', 'search', searchQuery],
    async () => {
      if (!searchQuery || searchQuery.length < 2) {
        return { success: true, data: [], total: 0 };
      }
      return await customerAPI.search(searchQuery);
    },
    {
      enabled: options?.enabled !== false && searchQuery.length >= 2,
      staleTime: 30000, // 30 seconds
    }
  );
};

export const useCustomerDetails = (customerId: number | null) => {
  return useQuery(
    ['customers', customerId],
    () => customerAPI.getDetails(customerId!),
    {
      enabled: !!customerId,
    }
  );
};

export const useCreateCustomer = () => {
  const queryClient = useQueryClient();
  
  return useMutation(
    (customerData: any) => customerAPI.create(customerData),
    {
      onSuccess: () => {
        queryClient.invalidateQueries(['customers']);
      },
    }
  );
};