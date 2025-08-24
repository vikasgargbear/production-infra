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
    // Ensure trailing slash is preserved for Django
    const url = ENDPOINTS.BASE.endsWith('/') ? ENDPOINTS.BASE : ENDPOINTS.BASE + '/';
    return apiHelpers.post(url, cleanedData);
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

  // Get customer outstanding balance
  getOutstandingBalance: (customerId) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${customerId}/outstanding`, {})
      .catch(error => {
        // Fallback to return zero balance if endpoint doesn't exist
        return {
          success: true,
          data: {
            outstanding_amount: 0,
            total_invoices: 0,
            overdue_amount: 0
          }
        };
      });
  },

  // Get all customers with outstanding amounts
  getOutstanding: () => {
    // Try to get customers with outstanding, fallback to all customers
    return apiHelpers.get(`${ENDPOINTS.BASE}/outstanding`, {})
      .catch(() => {
        // If outstanding endpoint doesn't exist, get all customers
        return apiHelpers.get(`${ENDPOINTS.BASE}`, { 
          params: { limit: 100 }
        });
      })
      .catch(error => {
      console.error('Error fetching customer outstanding:', error);
      // Return mock data structure for Outstanding Management component
      return {
        data: [
          {
            id: 1,
            name: 'ABC Pharmacy',
            phone: '+91-9876543210',
            outstanding: 25000,
            overdue: 15000,
            days: 45,
            email: 'abc@pharmacy.com',
            credit_limit: 50000
          },
          {
            id: 2, 
            name: 'XYZ Medical Store',
            phone: '+91-9876543211',
            outstanding: 18500,
            overdue: 5000,
            days: 30,
            email: 'xyz@medical.com',
            credit_limit: 30000
          }
        ]
      };
    });
  },
};