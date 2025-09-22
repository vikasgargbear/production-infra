import apiClient from '../apiClient';

// Request cache for performance optimization
const requestCache = new Map();
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

const getCachedResponse = (key) => {
  const cached = requestCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[GST API] Using cached response for: ${key}`);
    return cached.data;
  }
  return null;
};

const setCachedResponse = (key, data) => {
  requestCache.set(key, {
    data,
    timestamp: Date.now()
  });
};

// Cache management functions
export const clearGSTCache = () => {
  console.log('[GST API] Clearing all request cache');
  requestCache.clear();
};

export const gstApi = {
  // GST Dashboard Data
  dashboard: {
    getSummary: async (period) => {
      const cacheKey = `dashboard_${period}`;

      // Check cache first
      const cachedData = getCachedResponse(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      try {
        console.log(`[GST API] Fetching fresh dashboard data for period: ${period}`);
        const startTime = performance.now();

        const response = await apiClient.get('/gst/dashboard', {
          params: { period },
          timeout: 8000 // Specific timeout for dashboard
        });

        const duration = Math.round(performance.now() - startTime);
        console.log(`[GST API] Dashboard response received in ${duration}ms:`, response.data);

        // Cache the response
        setCachedResponse(cacheKey, response.data);

        return response.data;
      } catch (error) {
        console.error(`[GST API] Dashboard request failed:`, {
          error: error.message,
          status: error.response?.status,
          duration: error.code === 'ECONNABORTED' ? 'timeout' : 'unknown'
        });
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
        const response = await apiClient.get('/gst/metrics', {
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
        const response = await apiClient.get('/gst/returns', {
          params: filters
        });
        return response.data;
      } catch (error) {
        return { returns: [] };
      }
    },
    
    getStatus: async (period) => {
      const cacheKey = `returns_status_${period}`;

      // Check cache first
      const cachedData = getCachedResponse(cacheKey);
      if (cachedData) {
        return cachedData;
      }

      try {
        console.log(`[GST API] Fetching returns status for period: ${period}`);
        const startTime = performance.now();

        const response = await apiClient.get('/gst/returns/status', {
          params: { period },
          timeout: 8000 // Match component timeout for returns status
        });

        const duration = Math.round(performance.now() - startTime);
        console.log(`[GST API] Returns status received in ${duration}ms:`, response.data);

        // Cache the response
        setCachedResponse(cacheKey, response.data);

        return response.data;
      } catch (error) {
        console.error(`[GST API] Returns status request failed:`, {
          error: error.message,
          status: error.response?.status,
          duration: error.code === 'ECONNABORTED' ? 'timeout' : 'unknown'
        });
        return {
          gstr1: { status: 'pending', amount: 0, dueDate: null, filedDate: null },
          gstr3b: { status: 'pending', amount: 0, dueDate: null, filedDate: null },
          gstr2a: { status: 'available', amount: 0, lastUpdated: null }
        };
      }
    },
    
    fileReturn: async (returnType, data) => {
      return apiClient.post(`/gst/returns/${returnType}`, data);
    }
  },

  // GSTR Reports
  reports: {
    gstr1: async (filters) => {
      try {
        const response = await apiClient.get('/reports/tax/gstr1', {
          params: filters
        });
        return response.data;
      } catch (error) {
        return { b2b: [], b2c: [], hsn: [] };
      }
    },
    
    gstr3b: async (filters) => {
      try {
        const response = await apiClient.get('/reports/tax/gstr3b', {
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
        const response = await apiClient.get('/gst/reports/tax/gstr2a', {
          params: filters
        });
        return response.data;
      } catch (error) {
        return { invoices: [], summary: {} };
      }
    },
    
    hsnSummary: async (filters) => {
      try {
        const response = await apiClient.get('/reports/tax/hsn', {
          params: filters
        });
        return response.data;
      } catch (error) {
        return { hsnData: [] };
      }
    },

    creditDebitNotes: async (filters) => {
      try {
        const response = await apiClient.get('/gst/reports/credit-debit-notes', {
          params: filters
        });
        return response.data;
      } catch (error) {
        return { notes: [], summary: {} };
      }
    }
  },

  // GST Reconciliation
  reconciliation: {
    getStatus: async (period) => {
      try {
        const response = await apiClient.get('/gst/reconciliation/status', {
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
        const response = await apiClient.get('/gst/reconciliation/details', {
          params: { period }
        });
        return response.data;
      } catch (error) {
        return { records: [] };
      }
    },
    
    reconcile: async (data) => {
      return apiClient.post('/gst/reconciliation/reconcile', data);
    }
  },

  // GST Settings
  settings: {
    getConfig: async () => {
      const cacheKey = 'gst_settings_config';

      // Check cache first (settings change rarely, so longer cache)
      const cached = requestCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) { // 10 minutes for settings
        console.log(`[GST API] Using cached settings config`);
        return cached.data;
      }

      try {
        console.log(`[GST API] Fetching fresh settings config`);
        const startTime = performance.now();

        const response = await apiClient.get('/gst/settings', {
          timeout: 5000 // Match component timeout for settings
        });

        const duration = Math.round(performance.now() - startTime);
        console.log(`[GST API] Settings received in ${duration}ms:`, response.data);

        // Cache the response
        requestCache.set(cacheKey, {
          data: response.data,
          timestamp: Date.now()
        });

        return response.data;
      } catch (error) {
        console.error(`[GST API] Settings request failed:`, {
          error: error.message,
          duration: error.code === 'ECONNABORTED' ? 'timeout' : 'unknown'
        });
        return {
          gstin: '',
          state: '',
          is_valid: false,
          taxRates: [],
          hsnCodes: []
        };
      }
    },
    
    updateConfig: async (config) => {
      return apiClient.put('/gst/settings', config);
    },
    
    getTaxRates: async () => {
      try {
        const response = await apiClient.get('/gst/tax-rates');
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
        const response = await apiClient.post('/gst/calculate', {
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
        const response = await apiClient.get('/gst/compliance/status');
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
        const response = await apiClient.get('/gst/compliance/due-dates');
        return response.data;
      } catch (error) {
        return { dueDates: [] };
      }
    }
  }
};

export default gstApi;