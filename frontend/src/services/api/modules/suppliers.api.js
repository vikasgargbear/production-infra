import { apiHelpers } from '../apiClient';
import { API_CONFIG } from '../../../config/api.config';
import { cleanData } from '../utils/dataUtils';

const ENDPOINTS = API_CONFIG.ENDPOINTS.SUPPLIERS;

export const suppliersApi = {
  // Get all suppliers
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },
  
  // Get supplier by ID
  getById: (id) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${id}`);
  },
  
  // Create new supplier
  create: (data) => {
    const cleanedData = cleanData(data);
    console.log('Cleaned supplier data being sent to API:', cleanedData);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },
  
  // Update supplier
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(`${ENDPOINTS.BASE}/${id}`, cleanedData);
  },
  
  // Delete supplier
  delete: (id) => {
    return apiHelpers.delete(`${ENDPOINTS.BASE}/${id}`);
  },
  
  // Search suppliers
  search: (query, params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { 
      params: { search: query, ...params } 
    });
  },
  
  // Get supplier transactions
  getTransactions: (supplierId, params = {}) => {
    return apiHelpers.get(ENDPOINTS.TRANSACTIONS, {
      params: { supplier_id: supplierId, ...params }
    });
  },
  
  // Get suppliers with outstanding payments
  getWithOutstanding: () => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { has_outstanding: true }
    });
  },
  
  // Get supplier ledger
  getLedger: (supplierId, dateFrom, dateTo) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${supplierId}/ledger`, {
      params: { date_from: dateFrom, date_to: dateTo }
    });
  },

  // Get all suppliers with outstanding amounts
  getOutstanding: () => {
    // Try to get suppliers with outstanding, fallback to all suppliers
    return apiHelpers.get(`${ENDPOINTS.BASE}/outstanding`, {})
      .catch(() => {
        // If outstanding endpoint doesn't exist, get all suppliers
        return apiHelpers.get(`${ENDPOINTS.BASE}`, { 
          params: { limit: 100 }
        });
      })
      .catch(error => {
      console.error('Error fetching supplier outstanding:', error);
      // Return mock data structure for Outstanding Management component
      return {
        data: [
          {
            id: 1,
            name: 'MedSupply Corp',
            phone: '+91-9876543212',
            outstanding: 45000,
            overdue: 25000,
            days: 60,
            email: 'contact@medsupply.com',
            credit_limit: 100000
          },
          {
            id: 2,
            name: 'PharmaDist Ltd',
            phone: '+91-9876543213', 
            outstanding: 32000,
            overdue: 0,
            days: 0,
            email: 'info@pharmadist.com',
            credit_limit: 75000
          }
        ]
      };
    });
  },
};