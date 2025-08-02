import apiClient from '../apiClient';

export const reportsApi = {
  // Sales Reports
  sales: {
    summary: (filters) => apiClient.get('/reports/sales/summary', { params: filters }),
    detailed: (filters) => apiClient.get('/reports/sales/detailed', { params: filters }),
    byProduct: (filters) => apiClient.get('/reports/sales/by-product', { params: filters }),
    byCustomer: (filters) => apiClient.get('/reports/sales/by-customer', { params: filters }),
    trends: (filters) => apiClient.get('/reports/sales/trends', { params: filters }),
  },
  
  // Inventory Reports
  inventory: {
    stock: (filters) => apiClient.get('/reports/inventory/stock', { params: filters }),
    movement: (filters) => apiClient.get('/reports/inventory/movement', { params: filters }),
    valuation: (filters) => apiClient.get('/reports/inventory/valuation', { params: filters }),
    expiry: (filters) => apiClient.get('/reports/inventory/expiry', { params: filters }),
    reorder: () => apiClient.get('/reports/inventory/reorder'),
  },
  
  // Financial Reports
  financial: {
    profitLoss: (filters) => apiClient.get('/reports/financial/profit-loss', { params: filters }),
    balanceSheet: (filters) => apiClient.get('/reports/financial/balance-sheet', { params: filters }),
    cashFlow: (filters) => apiClient.get('/reports/financial/cash-flow', { params: filters }),
    receivables: (filters) => apiClient.get('/reports/financial/receivables', { params: filters }),
    payables: (filters) => apiClient.get('/reports/financial/payables', { params: filters }),
  },
  
  // Tax Reports
  tax: {
    gstSummary: (filters) => apiClient.get('/reports/tax/gst-summary', { params: filters }),
    gstR1: (filters) => apiClient.get('/reports/tax/gstr1', { params: filters }),
    gstR2: (filters) => apiClient.get('/reports/tax/gstr2', { params: filters }),
    gstR3B: (filters) => apiClient.get('/reports/tax/gstr3b', { params: filters }),
    hsn: (filters) => apiClient.get('/reports/tax/hsn', { params: filters }),
  },
  
  // Custom Reports
  custom: {
    generate: (reportId, filters) => apiClient.post(`/reports/custom/${reportId}/generate`, filters),
    getTemplates: () => apiClient.get('/reports/custom/templates'),
    saveTemplate: (template) => apiClient.post('/reports/custom/templates', template),
  },
  
  // Export Reports
  export: (reportType, filters, format = 'pdf') => 
    apiClient.post('/reports/export', { reportType, filters, format }, {
      responseType: 'blob'
    }),
};

export default reportsApi;