/**
 * Suppliers API Module
 * Handles supplier CRUD and related operations
 *
 * ENDPOINTS: /suppliers (backend: app/api/routes/master/suppliers.py)
 */

import { apiHelpers } from '../../apiClient';
import { createCrudApi } from '../../utils/createCrudApi';

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

const crud = createCrudApi({ basePath: '/suppliers', createPath: '/suppliers/' });

export const suppliersApi = {
  ...crud,

  // Search suppliers
  search: (query: string, params: SupplierParams = {}) => {
    return apiHelpers.get('/suppliers', {
      params: { search: query, ...params }
    });
  },

  // Get suppliers with outstanding payments
  getWithOutstanding: () => {
    return apiHelpers.get('/suppliers', {
      params: { has_outstanding: true }
    });
  },

  // Get supplier ledger
  getLedger: (supplierId: number | string, dateFrom?: string, dateTo?: string) => {
    return apiHelpers.get(`/suppliers/${supplierId}/ledger`, {
      params: { date_from: dateFrom, date_to: dateTo }
    });
  },

  // Get supplier outstanding balance
  getOutstandingBalance: (supplierId: number | string) => {
    return apiHelpers.get(`/suppliers/${supplierId}/outstanding`);
  },

  // Get all suppliers with outstanding amounts
  getOutstanding: () => {
    return apiHelpers.get('/suppliers/outstanding');
  },

  // Get supplier transactions
  getTransactions: (supplierId: number | string, params: any = {}) => {
    return apiHelpers.get(`/suppliers/${supplierId}/transactions`, { params });
  }
};
