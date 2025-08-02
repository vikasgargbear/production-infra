/**
 * Customer Service
 * Handles all customer-related API operations with full type safety
 */

import { BaseApiService } from '../api/base.service';
import { API_CONFIG } from '../../config/api.config';
import {
  Customer,
  CustomerCreateInput,
  CustomerUpdateInput,
  CustomerSearchParams,
  CreditCheckRequest,
  CreditCheckResponse,
  CustomerTransaction,
} from '../../types/models/customer';
import {
  ApiResponse,
  ListResponse,
  SingleResponse,
  CreateResponse,
  UpdateResponse,
  DeleteResponse,
} from '../../types/api/responses';

export class CustomerService extends BaseApiService {
  private readonly basePath = '/api/customers';
  
  /**
   * Get all customers with pagination and filtering
   */
  async getCustomers(params?: CustomerSearchParams): Promise<ListResponse<Customer>> {
    const queryString = params ? this.buildQueryString(params) : '';
    return this.get<Customer[]>(`${this.basePath}${queryString}`) as Promise<ListResponse<Customer>>;
  }
  
  /**
   * Search customers (for autocomplete)
   */
  async searchCustomers(query: string, limit: number = 10): Promise<ListResponse<Customer>> {
    return this.get<Customer[]>(`${API_CONFIG.ENDPOINTS.CUSTOMERS.SEARCH}`, {
      params: { q: query, limit },
    }) as Promise<ListResponse<Customer>>;
  }
  
  /**
   * Get single customer by ID
   */
  async getCustomer(customerId: number): Promise<SingleResponse<Customer>> {
    return this.get<Customer>(`${this.basePath}/${customerId}`);
  }
  
  /**
   * Create new customer
   */
  async createCustomer(data: CustomerCreateInput): Promise<CreateResponse<Customer>> {
    return this.post<Customer>(this.basePath, data);
  }
  
  /**
   * Update existing customer
   */
  async updateCustomer(
    customerId: number,
    data: CustomerUpdateInput
  ): Promise<UpdateResponse<Customer>> {
    return this.put<Customer>(`${this.basePath}/${customerId}`, data);
  }
  
  /**
   * Delete customer (soft delete)
   */
  async deleteCustomer(customerId: number): Promise<DeleteResponse> {
    return this.delete(`${this.basePath}/${customerId}`);
  }
  
  /**
   * Check customer credit availability
   */
  async checkCredit(request: CreditCheckRequest): Promise<ApiResponse<CreditCheckResponse>> {
    const { customer_id, order_amount } = request;
    return this.get<CreditCheckResponse>(
      `${API_CONFIG.ENDPOINTS.CUSTOMERS.CREDIT_CHECK}/${customer_id}`,
      { params: { order_amount } }
    );
  }
  
  /**
   * Get customer transactions/ledger
   */
  async getCustomerTransactions(
    customerId: number,
    params?: {
      from_date?: string;
      to_date?: string;
      transaction_type?: string;
      page?: number;
      page_size?: number;
    }
  ): Promise<ListResponse<CustomerTransaction>> {
    const queryString = params ? this.buildQueryString(params) : '';
    return this.get<CustomerTransaction[]>(
      `${API_CONFIG.ENDPOINTS.CUSTOMERS.TRANSACTIONS}/${customerId}${queryString}`
    ) as Promise<ListResponse<CustomerTransaction>>;
  }
  
  /**
   * Update customer outstanding balance
   * Used internally by invoice/payment services
   */
  async updateOutstanding(
    customerId: number,
    amount: number,
    transactionType: 'invoice' | 'payment' | 'credit_note' | 'debit_note',
    referenceId?: number
  ): Promise<ApiResponse<{ new_outstanding: number }>> {
    return this.post(`${this.basePath}/${customerId}/update-outstanding`, {
      amount,
      transaction_type: transactionType,
      reference_id: referenceId,
    });
  }
  
  /**
   * Get customers with outstanding balance
   */
  async getCustomersWithOutstanding(params?: {
    min_outstanding?: number;
    max_outstanding?: number;
    overdue_only?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<ListResponse<Customer>> {
    const queryParams = {
      ...params,
      has_outstanding: true,
    };
    return this.getCustomers(queryParams);
  }
  
  /**
   * Bulk update customer status
   */
  async bulkUpdateStatus(
    customerIds: number[],
    status: Customer['status']
  ): Promise<ApiResponse<{ updated: number }>> {
    return this.post(`${this.basePath}/bulk-update-status`, {
      customer_ids: customerIds,
      status,
    });
  }
  
  /**
   * Export customers to Excel/CSV
   */
  async exportCustomers(
    format: 'excel' | 'csv',
    params?: CustomerSearchParams
  ): Promise<Blob> {
    const queryString = params ? this.buildQueryString({ ...params, format }) : `?format=${format}`;
    
    const response = await this.http.get(`${this.basePath}/export${queryString}`, {
      responseType: 'blob',
    });
    
    return response.data;
  }
  
  /**
   * Validate GST number
   */
  async validateGST(gstNumber: string): Promise<ApiResponse<{
    valid: boolean;
    business_name?: string;
    address?: string;
    state_code?: string;
  }>> {
    return this.post(`${this.basePath}/validate-gst`, { gst_number: gstNumber });
  }
}

// Create singleton instance
export const customerService = new CustomerService();

// Export for use in React components
export default customerService;