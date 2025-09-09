import apiClient from '../apiClient';

export const gstApi = {
  // GST Dashboard Data
  dashboard: {
    getSummary: async (period) => {
      try {
        const response = await apiClient.get('/api/v1/gst/dashboard', {
          params: { period }
        });
        return response.data;
      } catch (error) {
        // Return default data structure if API fails
        return {
          taxPayable: 0,
          inputCredit: 0,
          netPayable: 0,
          complianceScore: 0,
          pendingReturns: [],
          filedReturns: []
        };
      }
    },
    
    getMetrics: async (filters = {}) => {
      try {
        const response = await apiClient.get('/api/v1/gst/metrics', {
          params: filters
        });
        return response.data;
      } catch (error) {
        return {
          currentMonth: {
            sales: 0,
            purchases: 0,
            outputTax: 0,
            inputTax: 0,
            netTax: 0
          },
          previousMonth: {
            sales: 0,
            purchases: 0,
            outputTax: 0,
            inputTax: 0,
            netTax: 0
          }
        };
      }
    }
  },

  // GST Returns
  returns: {
    getList: async (filters = {}) => {
      try {
        const response = await apiClient.get('/api/v1/gst/returns', {
          params: filters
        });
        return response.data;
      } catch (error) {
        return { returns: [] };
      }
    },
    
    getStatus: async (period) => {
      try {
        const response = await apiClient.get('/api/v1/gst/returns/status', {
          params: { period }
        });
        return response.data;
      } catch (error) {
        return {
          gstr1: { status: 'pending', amount: 0, dueDate: null, filedDate: null },
          gstr3b: { status: 'pending', amount: 0, dueDate: null, filedDate: null },
          gstr2a: { status: 'available', amount: 0, lastUpdated: null }
        };
      }
    },
    
    fileReturn: async (returnType, data) => {
      return apiClient.post(`/api/v1/gst/returns/${returnType}`, data);
    }
  },

  // GSTR Reports
  reports: {
    gstr1: async (filters) => {
      try {
        const response = await apiClient.get('/api/v1/reports/tax/gstr1', {
          params: filters
        });
        return response.data;
      } catch (error) {
        return { b2b: [], b2c: [], hsn: [] };
      }
    },
    
    gstr3b: async (filters) => {
      try {
        const response = await apiClient.get('/api/v1/reports/tax/gstr3b', {
          params: filters
        });
        return response.data;
      } catch (error) {
        return {
          outwardSupplies: { taxable: 0, integrated: 0, central: 0, state: 0 },
          inwardSupplies: { taxable: 0, integrated: 0, central: 0, state: 0 },
          itc: { integrated: 0, central: 0, state: 0, cess: 0 },
          taxPayable: { integrated: 0, central: 0, state: 0, cess: 0 }
        };
      }
    },
    
    gstr2a: async (filters) => {
      try {
        const response = await apiClient.get('/api/v1/reports/tax/gstr2a', {
          params: filters
        });
        return response.data;
      } catch (error) {
        return { invoices: [], summary: {} };
      }
    },
    
    hsnSummary: async (filters) => {
      try {
        const response = await apiClient.get('/api/v1/reports/tax/hsn', {
          params: filters
        });
        return response.data;
      } catch (error) {
        return { hsnData: [] };
      }
    }
  },

  // GST Reconciliation
  reconciliation: {
    getStatus: async (period) => {
      try {
        const response = await apiClient.get('/api/v1/gst/reconciliation/status', {
          params: { period }
        });
        return response.data;
      } catch (error) {
        return {
          matched: 0,
          mismatched: 0,
          missing: 0,
          total: 0
        };
      }
    },
    
    getDetails: async (period) => {
      try {
        const response = await apiClient.get('/api/v1/gst/reconciliation/details', {
          params: { period }
        });
        return response.data;
      } catch (error) {
        return { records: [] };
      }
    },
    
    reconcile: async (data) => {
      return apiClient.post('/api/v1/gst/reconciliation/reconcile', data);
    }
  },

  // GST Settings
  settings: {
    getConfig: async () => {
      try {
        const response = await apiClient.get('/api/v1/gst/settings');
        return response.data;
      } catch (error) {
        return {
          gstin: '',
          state: '',
          taxRates: [],
          hsnCodes: []
        };
      }
    },
    
    updateConfig: async (config) => {
      return apiClient.put('/api/v1/gst/settings', config);
    },
    
    getTaxRates: async () => {
      try {
        const response = await apiClient.get('/api/v1/gst/tax-rates');
        return response.data;
      } catch (error) {
        return { rates: [] };
      }
    }
  },

  // Tax Calculations
  calculate: {
    getTaxAmount: async (amount, hsnCode, isInterstate = false) => {
      try {
        const response = await apiClient.post('/api/v1/gst/calculate', {
          amount,
          hsnCode,
          isInterstate
        });
        return response.data;
      } catch (error) {
        // Return basic calculation
        const gstRate = 18; // Default GST rate
        const taxableAmount = amount;
        const taxAmount = (taxableAmount * gstRate) / 100;
        
        if (isInterstate) {
          return {
            taxableAmount,
            igst: taxAmount,
            cgst: 0,
            sgst: 0,
            total: taxableAmount + taxAmount
          };
        } else {
          return {
            taxableAmount,
            igst: 0,
            cgst: taxAmount / 2,
            sgst: taxAmount / 2,
            total: taxableAmount + taxAmount
          };
        }
      }
    }
  },

  // Compliance
  compliance: {
    getStatus: async () => {
      try {
        const response = await apiClient.get('/api/v1/gst/compliance/status');
        return response.data;
      } catch (error) {
        return {
          score: 0,
          issues: [],
          recommendations: []
        };
      }
    },
    
    getDueDates: async () => {
      try {
        const response = await apiClient.get('/api/v1/gst/compliance/due-dates');
        return response.data;
      } catch (error) {
        return { dueDates: [] };
      }
    }
  }
};

export default gstApi;