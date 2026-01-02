/**
 * Suppliers API Module
 * Handles supplier CRUD and related operations
 * 
 * ENDPOINTS: /suppliers (backend: app/api/routes/master/suppliers.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

// ============================================================================
// TYPES
// ============================================================================

export interface SupplierParams {
  limit?: number;
  offset?: number;
  search?: string;
  has_outstanding?: boolean;
}

// ============================================================================
// API
// ============================================================================

const ENDPOINTS = {
  BASE: '/suppliers',
  DETAILS: (id: number | string) => `/suppliers/${id}`,
  LEDGER: (id) => `/suppliers/${id}/ledger`,
  OUTSTANDING: (id) => `/suppliers/${id}/outstanding`,
  SEARCH: '/suppliers/search'
};

export const suppliersApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all suppliers
  getAll: (params: SupplierParams = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get supplier by ID
  getById: (id: number | string) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Create new supplier
  create: (data: any) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },

  // Update supplier
  update: (id: number | string, data: any) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
  },

  // Delete supplier
  delete: (id: number | string) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // SEARCH & FILTERS
  // =========================================================================

  // Search suppliers
  search: (query: string, params: SupplierParams = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { search: query, ...params }
    });
  },

  // Get suppliers with outstanding payments
  getWithOutstanding: () => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { has_outstanding: true }
    });
  },

  // =========================================================================
  // LEDGER & OUTSTANDING
  // =========================================================================

  // Get supplier ledger
  getLedger: (supplierId: number | string, dateFrom?: string, dateTo?: string) => {
    return apiHelpers.get(ENDPOINTS.LEDGER(supplierId), {
      params: { date_from: dateFrom, date_to: dateTo }
    });
  },

  // Get supplier outstanding balance
  getOutstandingBalance: (supplierId: number | string) => {
    return apiHelpers.get(ENDPOINTS.OUTSTANDING(supplierId));
  },

  // Get all suppliers with outstanding amounts
  getOutstanding: () => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/outstanding`);
  },

  // =========================================================================
  // TRANSACTIONS
  // =========================================================================

  // Get supplier transactions
  getTransactions: (supplierId: number | string, params: any = {}) => {
    return apiHelpers.get(`${ENDPOINTS.DETAILS(supplierId)}/transactions`, { params });
  }
};