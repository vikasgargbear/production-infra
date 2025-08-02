import { apiHelpers } from '../apiClient';
import { API_CONFIG } from '../../../config/api.config';
import { cleanData } from '../utils/dataUtils';

const ENDPOINTS = API_CONFIG.ENDPOINTS.CUSTOMERS;

export const customersApi = {
  // Get all customers
  getAll: (params = {}) => {
    // Support search parameter for backward compatibility
    if (params && params.search) {
      return apiHelpers.get(ENDPOINTS.BASE, { params });
    }
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },
  
  // Get customer by ID
  getById: (id) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${id}`);
  },
  
  // Create new customer
  create: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },
  
  // Update customer
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(`${ENDPOINTS.BASE}/${id}`, cleanedData);
  },
  
  // Delete customer
  delete: (id) => {
    return apiHelpers.delete(`${ENDPOINTS.BASE}/${id}`);
  },
  
  // Search customers
  search: (query, params = {}) => {
    // Use 'search' parameter for backward compatibility with old API
    return apiHelpers.get(ENDPOINTS.BASE, { 
      params: { search: query, ...params } 
    });
  },
  
  // Check customer credit
  checkCredit: (customerId) => {
    return apiHelpers.get(ENDPOINTS.CREDIT_CHECK, {
      params: { customer_id: customerId }
    });
  },
  
  // Get customer transactions
  getTransactions: (customerId, params = {}) => {
    return apiHelpers.get(ENDPOINTS.TRANSACTIONS, {
      params: { customer_id: customerId, ...params }
    });
  },
  
  // Get customers with outstanding payments
  getWithOutstanding: () => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { has_outstanding: true }
    });
  },
  
  // Update credit limit
  updateCreditLimit: (customerId, creditLimit) => {
    return apiHelpers.patch(`${ENDPOINTS.BASE}/${customerId}`, {
      credit_limit: creditLimit
    });
  },
  
  // Get customer ledger
  getLedger: (customerId, dateFrom, dateTo) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${customerId}/ledger`, {
      params: { date_from: dateFrom, date_to: dateTo }
    });
  },
  
  // Send SMS to customer
  sendSMS: (customerId, message) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/${customerId}/sms`, {
      message
    });
  },
};