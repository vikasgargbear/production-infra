/**
 * Reports API Module
 * Handles report generation and export
 * 
 * ENDPOINTS: /reports (backend: various report endpoints)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
  BASE: '/reports',
  EXPORT: '/reports/export',
  CUSTOM: '/reports/custom'
};

export const reportsApi = {
  // =========================================================================
  // SALES REPORTS
  // =========================================================================

  sales: {
    summary: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/sales/summary`, { params: filters }),
    detailed: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/sales/detailed`, { params: filters }),
    byProduct: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/sales/by-product`, { params: filters }),
    byCustomer: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/sales/by-customer`, { params: filters }),
    trends: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/sales/trends`, { params: filters })
  },

  // =========================================================================
  // INVENTORY REPORTS
  // =========================================================================

  inventory: {
    stock: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/inventory/stock`, { params: filters }),
    movement: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/inventory/movement`, { params: filters }),
    valuation: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/inventory/valuation`, { params: filters }),
    expiry: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/inventory/expiry`, { params: filters }),
    reorder: () => apiHelpers.get(`${ENDPOINTS.BASE}/inventory/reorder`)
  },

  // =========================================================================
  // FINANCIAL REPORTS
  // =========================================================================

  financial: {
    profitLoss: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/financial/profit-loss`, { params: filters }),
    balanceSheet: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/financial/balance-sheet`, { params: filters }),
    trialBalance: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/financial/trial-balance`, { params: filters }),
    cashFlow: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/financial/cash-flow`, { params: filters }),
    receivables: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/financial/receivables`, { params: filters }),
    payables: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/financial/payables`, { params: filters })
  },

  // =========================================================================
  // TAX REPORTS
  // =========================================================================

  tax: {
    gstSummary: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/tax/gst-summary`, { params: filters }),
    gstR1: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/tax/gstr1`, { params: filters }),
    gstR2: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/tax/gstr2`, { params: filters }),
    gstR3B: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/tax/gstr3b`, { params: filters }),
    hsn: (filters = {}) => apiHelpers.get(`${ENDPOINTS.BASE}/tax/hsn`, { params: filters })
  },

  // =========================================================================
  // CUSTOM REPORTS
  // =========================================================================

  custom: {
    generate: (reportId, filters = {}) => apiHelpers.post(`${ENDPOINTS.CUSTOM}/${reportId}/generate`, filters),
    getTemplates: () => apiHelpers.get(`${ENDPOINTS.CUSTOM}/templates`),
    saveTemplate: (template) => apiHelpers.post(`${ENDPOINTS.CUSTOM}/templates`, template)
  },

  // =========================================================================
  // EXPORT
  // =========================================================================

  export: (reportType, filters = {}, format = 'pdf') => {
    return apiHelpers.post(ENDPOINTS.EXPORT, { reportType, filters, format }, { responseType: 'blob' });
  }
};

export default reportsApi;