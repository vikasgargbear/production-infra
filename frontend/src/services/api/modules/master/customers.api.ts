/**
 * Customers API Module
 * Handles customer CRUD and related operations
 * 
 * ENDPOINTS: /customers (backend: app/api/routes/master/customers.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

// ============================================================================
// TYPES
// ============================================================================

export interface CustomerParams {
  limit?: number;
  offset?: number;
  search?: string;
  has_outstanding?: boolean;
}

// ============================================================================
// API
// ============================================================================

const ENDPOINTS = {
  BASE: '/customers',
  DETAILS: (id: number | string) => `/customers/${id}`,
  LEDGER: (id: number | string) => `/customers/${id}/ledger`,
  OUTSTANDING: (id: number | string) => `/customers/${id}/outstanding`,
  CREDIT_CHECK: '/customers/credit-check'
} as const;

export const customersApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all customers
  getAll: (params: CustomerParams = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Alias for backward compatibility
  list: (params: CustomerParams = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get all customers with embedded addresses (for offline sync)
  getAllWithAddresses: (params: any = {}) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/all-with-addresses`, { params });
  },

  // Get customer by ID
  getById: (id: number | string) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Alias for getById (backward compatibility)
  getDetails: (id: number | string) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Create new customer
  create: (data: any) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },

  // Update customer
  update: (id: number | string, data: any) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
  },

  // Delete customer
  delete: (id: number | string) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // SEARCH & FILTERS
  // =========================================================================

  // Search customers
  search: (query: string, params: CustomerParams = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { search: query, ...params }
    });
  },

  // Get customers with outstanding payments
  getWithOutstanding: () => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { has_outstanding: true }
    });
  },

  // =========================================================================
  // CREDIT & LEDGER
  // =========================================================================

  // Check customer credit
  checkCredit: (customerId: number | string) => {
    return apiHelpers.get(ENDPOINTS.CREDIT_CHECK, {
      params: { customer_id: customerId }
    });
  },

  // Update credit limit
  updateCreditLimit: (customerId: number | string, creditLimit: number) => {
    return apiHelpers.patch(ENDPOINTS.DETAILS(customerId), {
      credit_limit: creditLimit
    });
  },

  // Get customer ledger
  getLedger: (customerId: number | string, dateFrom?: string, dateTo?: string) => {
    return apiHelpers.get(ENDPOINTS.LEDGER(customerId), {
      params: { date_from: dateFrom, date_to: dateTo }
    });
  },

  // Get customer outstanding balance
  getOutstandingBalance: (customerId: number | string) => {
    return apiHelpers.get(ENDPOINTS.OUTSTANDING(customerId));
  },

  // Get all customers with outstanding amounts
  getOutstanding: () => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/outstanding`);
  },

  // =========================================================================
  // TRANSACTIONS & COMMUNICATION
  // =========================================================================

  // Get customer transactions
  getTransactions: (customerId: number | string, params: any = {}) => {
    return apiHelpers.get(`${ENDPOINTS.DETAILS(customerId)}/transactions`, { params });
  },

  // Send SMS to customer
  sendSMS: (customerId: number | string, message: string) => {
    return apiHelpers.post(`${ENDPOINTS.DETAILS(customerId)}/sms`, { message });
  }
};