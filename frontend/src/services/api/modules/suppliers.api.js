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
};