/**
 * Customers API Module
 * Handles customer CRUD and related operations
 * 
 * ENDPOINTS: /customers (backend: app/api/routes/master/customers.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
  BASE: '/customers',
  DETAILS: (id) => `/customers/${id}`,
  LEDGER: (id) => `/customers/${id}/ledger`,
  OUTSTANDING: (id) => `/customers/${id}/outstanding`,
  CREDIT_CHECK: '/customers/credit-check'
};

export const customersApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all customers
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get customer by ID
  getById: (id) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Create new customer
  create: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },

  // Update customer
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
  },

  // Delete customer
  delete: (id) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // SEARCH & FILTERS
  // =========================================================================

  // Search customers
  search: (query, params = {}) => {
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
  checkCredit: (customerId) => {
    return apiHelpers.get(ENDPOINTS.CREDIT_CHECK, {
      params: { customer_id: customerId }
    });
  },

  // Update credit limit
  updateCreditLimit: (customerId, creditLimit) => {
    return apiHelpers.patch(ENDPOINTS.DETAILS(customerId), {
      credit_limit: creditLimit
    });
  },

  // Get customer ledger
  getLedger: (customerId, dateFrom, dateTo) => {
    return apiHelpers.get(ENDPOINTS.LEDGER(customerId), {
      params: { date_from: dateFrom, date_to: dateTo }
    });
  },

  // Get customer outstanding balance
  getOutstandingBalance: (customerId) => {
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
  getTransactions: (customerId, params = {}) => {
    return apiHelpers.get(`${ENDPOINTS.DETAILS(customerId)}/transactions`, { params });
  },

  // Send SMS to customer
  sendSMS: (customerId, message) => {
    return apiHelpers.post(`${ENDPOINTS.DETAILS(customerId)}/sms`, { message });
  }
};