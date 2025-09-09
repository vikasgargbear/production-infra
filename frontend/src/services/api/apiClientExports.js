/**
 * JavaScript wrapper for TypeScript API exports
 * This file provides proper JavaScript exports for the TypeScript APIs
 */

// Use dynamic import to avoid initialization order issues
import axios from 'axios';
import orgIdManager from '../OrgIdManager';

// Create our own apiClient instance to avoid circular dependency
// Use HTTPS for Railway production deployment
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'https://pharma-backend-production-0c09.up.railway.app';
const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api`,  // Consolidated API - no version numbers
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Add request interceptor for auth token and org_id
apiClient.interceptors.request.use((config) => {
  // ALWAYS get org_id from OrgIdManager (guaranteed to return a value)
  const orgId = orgIdManager.getOrgId();
  
  // Add org_id header
  config.headers['X-Org-Id'] = orgId;
  
  // Log only if there's an issue
  const isPublicEndpoint = config.url?.includes('/setup/check') || 
                          config.url?.includes('/auth/') ||
                          config.url?.includes('/login');
  
  if (!orgIdManager.isValidOrgId(orgId) && !isPublicEndpoint) {
  }
  
  // Then add auth token if it exists
  const token = localStorage.getItem('authToken') || localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Export the configured apiClient for use by other modules
export { apiClient };

// Define the customerAPI directly in JavaScript to avoid TypeScript export issues
export const customerAPI = {
  /**
   * Lightning-fast customer search for production
   */
  search: async (query, options = {}) => {
    try {
      // Use the main customers endpoint directly with ultra-conservative settings
      const response = await apiClient.get('/customers/', {
        params: {
          search: query,
          limit: Math.min(options.limit || 10, 10), // Reasonable limit for search results
          include_stats: false, // Never include stats for search
          fast_search: true, // Use fast search mode
        },
        timeout: 15000, // 15 second timeout for better reliability
      });
      
      // Handle the response structure from customers endpoint
      const customers = response.data?.customers || response.data || [];
      
      return {
        success: true,
        data: Array.isArray(customers) ? customers : [],
        total: response.data?.total || customers.length || 0
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        total: 0,
        error: error.response?.status === 500 ? 'Database connection issue' : error.message
      };
    }
  },

  /**
   * Get customer details with ledger summary
   */
  getDetails: async (customerId) => {
    const response = await apiClient.get(`/customers/${customerId}`);
    return response.data;
  },

  /**
   * Create new customer
   */
  create: async (customerData) => {
    const response = await apiClient.post('/customers/', customerData);
    return response.data;
  },

  /**
   * Get outstanding invoices for customer
   */
  getOutstanding: async (customerId) => {
    const response = await apiClient.get(`/customers/${customerId}/outstanding`);
    return response.data;
  },

  /**
   * Get all customers (list method for compatibility)
   */
  list: async (options = {}) => {
    try {
      const response = await apiClient.get('/customers/', {
        params: {
          limit: Math.min(options.limit || 100, 100),
          skip: options.offset || options.skip || 0,
          search: options.search || '',
          include_stats: false,
        },
      });
      
      const customers = response.data?.customers || response.data || [];
      
      return {
        success: true,
        data: Array.isArray(customers) ? customers : [],
        total: response.data?.total || customers.length || 0
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        total: 0,
        error: error.message
      };
    }
  },
};

// Define the productAPI directly in JavaScript
export const productAPI = {
  /**
   * Search products using PostgreSQL function
   */
  search: async (query, options = {}) => {
    try {
      // Use correct products endpoint with search parameter + timeout protection
      const response = await apiClient.get('/products/', {
        params: {
          search: query,  // Backend expects 'search' not 'q'
          product_type: options.product_type || '',
          manufacturer: options.manufacturer || '',
          limit: Math.min(options.limit || 20, 20), // Reduce to 20 for speed
          skip: options.offset || 0,  // Backend uses 'skip' not 'offset'
        },
        timeout: 8000, // 8 second timeout to reduce false timeouts on slow networks
      });
      
      // Backend returns array directly, not wrapped in products
      return {
        success: true,
        data: response.data || [],
        total: response.data?.length || 0
      };
    } catch (error) {
      // Fallback to simplified search if main endpoint fails or times out
      if (error.code === 'ECONNABORTED' || error.response?.status >= 500) {
        try {
          if (!window.__productSearchFallbackWarned) {
            // Warn only once per session to avoid console spam
            window.__productSearchFallbackWarned = true;
          }
          const response = await apiClient.get('/products/', {
            params: {
              search: query,
              limit: 10, // Even smaller limit for fallback
            },
            timeout: 7000, // 7 second fallback timeout
          });
          
          return {
            success: true,
            data: response.data || [],
            total: response.data?.length || 0,
            warning: 'Using fallback search',
          };
        } catch (fallbackError) {
          return {
            success: false,
            data: [],
            total: 0,
            error: 'Search temporarily unavailable'
          };
        }
      }
      return {
        success: false,
        data: [],
        total: 0,
        error: error.message
      };
    }
  },

  /**
   * Get product details with stock info
   */
  getDetails: async (productId) => {
    const response = await apiClient.get(`/products/${productId}`);
    return response.data;
  },

  /**
   * Create new product
   */
  create: async (productData) => {
    const response = await apiClient.post('/products/', productData);
    return response.data;
  },

  /**
   * Get all products with stock data
   */
  getAll: async (options = {}) => {
    try {
      const response = await apiClient.get('/products/', {
        params: {
          limit: Math.min(options.limit || 100, 100), // Backend max limit is 100
          skip: options.offset || options.skip || 0,
          search: options.search || '',
          product_type: options.product_type || '',
          manufacturer: options.manufacturer || '',
        },
      });
      
      // Return in expected format
      return {
        success: true,
        data: response.data || [],
        total: response.data?.length || 0
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        total: 0,
        error: error.message
      };
    }
  },

  /**
   * Get product batches
   */
  getBatches: async (productId) => {
    const response = await apiClient.get(`/pg/products/${productId}/batches`);
    return response.data;
  },

  /**
   * Generic GET method for any product endpoint
   */
  get: async (endpoint) => {
    const response = await apiClient.get(endpoint);
    return response;
  },

  /**
   * Generic POST method for any product endpoint
   */
  post: async (endpoint, data) => {
    const response = await apiClient.post(endpoint, data);
    return response;
  },

  /**
   * List method (alias for getAll) for compatibility
   */
  list: async (options = {}) => {
    return productAPI.getAll(options);
  },
};

// Define other commonly used APIs
export const invoiceAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/invoices', {
      params: {
        q: query,
        customer_id: options.customerId,
        date_from: options.dateFrom,
        date_to: options.dateTo,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
  },

  getDetails: async (invoiceId) => {
    const response = await apiClient.get(`/invoices/${invoiceId}`);
    return response.data;
  },
};

export const ordersAPI = {
  search: async (query, options = {}) => {
    try {
      const response = await apiClient.get('/orders/', {
        params: {
          search: query?.search || query || '',
          customer_id: options.customerId,
          status: options.status,
          limit: options.limit || 50,
          offset: options.offset || 0,
        },
        timeout: 10000,
      });
      
      // Handle different response structures
      const orders = response.data?.data || response.data?.orders || response.data || [];
      
      return {
        success: true,
        data: Array.isArray(orders) ? orders : [],
        total: response.data?.total || orders.length || 0
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        total: 0,
        error: error.message
      };
    }
  },
  
  get: async (orderId) => {
    try {
      const response = await apiClient.get(`/orders/${orderId}`);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  },
  
  create: async (orderData) => {
    try {
      const response = await apiClient.post('/orders/', orderData);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  },
};

export const purchasesAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/purchases', {
      params: {
        q: query,
        supplier_id: options.supplierId,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
  },
  
  getAll: async (params = {}) => {
    const response = await apiClient.get('/purchases', {
      params: {
        limit: params.limit || 100,
        skip: params.skip || 0,
        supplier_id: params.supplier_id,
        product_id: params.product_id,
        start_date: params.start_date,
        end_date: params.end_date,
        sort: params.sort,
        order: params.order,
      },
    });
    return { data: response.data };
  },
  
  getById: async (id) => {
    const response = await apiClient.get(`/purchases/${id}`);
    return response.data;
  },
  
  create: async (data) => {
    const response = await apiClient.post('/purchases', data);
    return response.data;
  },
  
  update: async (id, data) => {
    const response = await apiClient.put(`/purchases/${id}`, data);
    return response.data;
  },
  
  delete: async (id) => {
    const response = await apiClient.delete(`/purchases/${id}`);
    return response.data;
  },
  
  // Purchase Order specific methods
  generatePONumber: async () => {
    // Generate PO number locally since backend doesn't have this endpoint
    try {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      return {
        data: {
          po_number: `PO-${year}${month}-${random}`
        }
      };
    } catch (error) {
      throw error;
    }
  },
};

export const supplierAPI = {
  search: async (query, options = {}) => {
    try {
      const response = await apiClient.get('/suppliers/', {
        params: {
          search: query,  // Backend expects 'search' not 'q'
          limit: Math.min(options.limit || 20, 20),
          skip: options.offset || 0,  // Backend uses 'skip' not 'offset'
        },
        timeout: 5000,
      });
      
      // Handle response structure from suppliers endpoint
      const suppliers = response.data?.suppliers || response.data || [];
      
      return {
        success: true,
        data: Array.isArray(suppliers) ? suppliers : [],
        total: response.data?.total || suppliers.length || 0
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        total: 0,
        error: error.message
      };
    }
  },

  create: async (supplierData) => {
    const response = await apiClient.post('/suppliers/', supplierData);
    return response.data;
  },

  /**
   * Get all suppliers (list method for compatibility)
   */
  list: async (options = {}) => {
    try {
      const response = await apiClient.get('/suppliers/', {
        params: {
          limit: Math.min(options.limit || 100, 100),
          skip: options.offset || options.skip || 0,
          search: options.search || '',
        },
      });
      
      const suppliers = response.data?.suppliers || response.data || [];
      
      return {
        success: true,
        data: Array.isArray(suppliers) ? suppliers : [],
        total: response.data?.total || suppliers.length || 0
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        total: 0,
        error: error.message
      };
    }
  },

  /**
   * Get supplier details
   */
  getDetails: async (supplierId) => {
    const response = await apiClient.get(`/suppliers/${supplierId}`);
    return response.data;
  },
};

export const paymentAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/pg/payments/search', {
      params: {
        q: query,
        party_id: options.partyId,
        party_type: options.partyType,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
  },
};

export const challansAPI = {
  search: async (query, options = {}) => {
    try {
      // Use the main delivery challan endpoint instead of pg wrapper
      const response = await apiClient.get('/enterprise-delivery-challan/', {
        params: {
          limit: options.limit || 50,
          offset: options.offset || 0,
          search: query?.search || query || '',
        },
        timeout: 10000,
      });
      
      // Handle different response structures
      const challans = response.data?.data || response.data?.challans || response.data || [];
      
      return {
        success: true,
        data: Array.isArray(challans) ? challans : [],
        total: response.data?.total || challans.length || 0
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        total: 0,
        error: error.message
      };
    }
  },

  /**
   * Get challan details
   */
  get: async (challanId) => {
    try {
      const response = await apiClient.get(`/enterprise-delivery-challan/${challanId}`);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  },

  /**
   * Create new challan
   */
  create: async (challanData) => {
    try {
      const response = await apiClient.post('/enterprise-delivery-challan/', challanData);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  },

  /**
   * Update challan
   */
  update: async (challanId, challanData) => {
    try {
      const response = await apiClient.put(`/enterprise-delivery-challan/${challanId}`, challanData);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: error.message
      };
    }
  },
};

export const salesOrdersAPI = {
  search: async (query, options = {}) => {
    try {
      // Use the main sales orders endpoint instead of pg wrapper
      const response = await apiClient.get('/orders/', {
        params: {
          search: query?.search || query || '',
          customer_id: options.customerId,
          status: options.status,
          limit: options.limit || 50,
          offset: options.offset || 0,
        },
        timeout: 10000,
      });

      // Handle different response structures
      const orders = response.data?.data || response.data?.orders || response.data || [];
      
      return {
        success: true,
        data: Array.isArray(orders) ? orders : [],
        total: response.data?.total || orders.length || 0
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        total: 0,
        error: error.message
      };
    }
  },
  
  getAll: async (params = {}) => {
    const response = await apiClient.get('/sales-orders', {
      params: {
        limit: params.limit || 100,
        offset: params.offset || 0,
        status: params.status,
        customer_id: params.customer_id,
        date_from: params.date_from,
        date_to: params.date_to,
      },
    });
    return response.data;
  },
  
  getById: async (id) => {
    const response = await apiClient.get(`/sales-orders/${id}`);
    return response.data;
  },
  
  create: async (data) => {
    const response = await apiClient.post('/sales-orders', data);
    return response.data;
  },
  
  update: async (id, data) => {
    const response = await apiClient.put(`/sales-orders/${id}`, data);
    return response.data;
  },
  
  convertToInvoice: async (id) => {
    const response = await apiClient.post(`/sales-orders/${id}/convert-to-invoice`);
    return response.data;
  },
  
  convertToChallan: async (id) => {
    const response = await apiClient.post(`/sales-orders/${id}/convert-to-challan`);
    return response.data;
  },
};

// Note: We don't re-export apiClient here to avoid circular dependency
// The apiClient is already available through the main index.js