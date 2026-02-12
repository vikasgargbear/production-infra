/**
 * Customers API Module
 * Handles customer CRUD and related operations
 *
 * ENDPOINTS: /customers (backend: app/api/routes/master/customers.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';
import { createCrudApi } from '../../utils/createCrudApi';

// ============================================================================
// TYPES
// ============================================================================

export interface CustomerParams {
  limit?: number;
  offset?: number;
  search?: string;
  has_outstanding?: boolean;
  include_credit?: boolean;
}

// ============================================================================
// API
// ============================================================================

const crud = createCrudApi({ basePath: '/customers', createPath: '/customers/' });

export const customersApi = {
  ...crud,

  // Get all customers with embedded addresses (for offline sync)
  getAllWithAddresses: (params: any = {}) => {
    return apiHelpers.get('/customers/all-with-addresses', { params });
  },

  // Create customer address (for offline sync)
  createAddress: (customerId: string, addressData: any) => {
    const cleanedData = cleanData(addressData);
    return apiHelpers.post(`/customers/${customerId}/addresses/`, cleanedData);
  },

  // Search customers
  search: (query: string, params: CustomerParams = {}) => {
    return apiHelpers.get('/customers', {
      params: { search: query, ...params }
    });
  },

  // Get customers with outstanding payments
  getWithOutstanding: () => {
    return apiHelpers.get('/customers', {
      params: { has_outstanding: true }
    });
  },

  // Check customer credit
  checkCredit: (customerId: number | string) => {
    return apiHelpers.get('/customers/credit-check', {
      params: { customer_id: customerId }
    });
  },

  // Update credit limit
  updateCreditLimit: (customerId: number | string, creditLimit: number) => {
    return apiHelpers.patch(`/customers/${customerId}`, {
      credit_limit: creditLimit
    });
  },

  // Get customer ledger
  getLedger: (customerId: number | string, dateFrom?: string, dateTo?: string) => {
    return apiHelpers.get(`/customers/${customerId}/ledger`, {
      params: { date_from: dateFrom, date_to: dateTo }
    });
  },

  // Get customer outstanding balance
  getOutstandingBalance: (customerId: number | string) => {
    return apiHelpers.get(`/customers/${customerId}/outstanding`);
  },

  // Get all customers with outstanding amounts
  getOutstanding: () => {
    return apiHelpers.get('/customers/outstanding');
  },

  // Get customer transactions
  getTransactions: (customerId: number | string, params: any = {}) => {
    return apiHelpers.get(`/customers/${customerId}/transactions`, { params });
  },

  // Send SMS to customer
  sendSMS: (customerId: number | string, message: string) => {
    return apiHelpers.post(`/customers/${customerId}/sms`, { message });
  }
};
