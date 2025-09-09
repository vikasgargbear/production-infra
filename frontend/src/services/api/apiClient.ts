/**
 * API Client for PostgreSQL Function Wrappers
 * Uses consolidated /api/pg/* endpoints that wrap PostgreSQL functions
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
// @ts-ignore - JavaScript module
import orgIdManager from '../OrgIdManager';

// Get API URL from environment or use default
// Always use HTTPS for production Railway deployments
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'https://pharma-backend-production-0c09.up.railway.app';

// Migrate auth_token to authToken for consistency
(() => {
  const oldToken = localStorage.getItem('auth_token');
  const newToken = localStorage.getItem('authToken');
  
  if (oldToken && !newToken) {
    // Migrate from auth_token to authToken
    localStorage.setItem('authToken', oldToken);
  }
})();

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api/`,  // Add trailing slash for proper URL joining
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Request interceptor for auth token
apiClient.interceptors.request.use(
  (config) => {
    // Check if this is an endpoint that doesn't need auth
    const isPublicEndpoint = config.url?.includes('/auth/') || 
                            config.url?.includes('/login') || 
                            config.url?.includes('/register') ||
                            config.url?.includes('/organizations/check') ||
                            config.url?.includes('/organizations/create') ||
                            config.url?.includes('/setup/check') ||  // Allow setup check without auth
                            config.url?.includes('/health');  // Allow health checks
    
    // FIRST: Always get org_id from OrgIdManager (guaranteed to return a value)
    const orgId = orgIdManager.getOrgId();
    
    // Add org_id header
    config.headers['X-Org-Id'] = orgId;
    
    // Only check validity, no logging needed
    
    // THEN: Get auth token - check both keys for compatibility
    const token = localStorage.getItem('authToken') || localStorage.getItem('auth_token');
    
    if (token) {
      try {
        // Validate token format first
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
          // Not a valid JWT format
          config.headers.Authorization = `Bearer ${token}`;
        } else {
          // Decode token to check expiry (without verification)
          const payload = JSON.parse(atob(tokenParts[1]));
          const expiry = payload.exp * 1000; // Convert to milliseconds
          
          // Add 5 minute buffer for clock skew
          const now = Date.now();
          const expiryWithBuffer = expiry - (5 * 60 * 1000); // 5 minutes before actual expiry
          
          if (now < expiry) {
            // Token is still valid
            config.headers.Authorization = `Bearer ${token}`;
            // If token has org_id, update the manager
            const orgIdFromToken = payload.org_id || payload.organization_id;
            if (orgIdFromToken && orgIdFromToken !== orgId) {
              // Token has a different org_id, update the manager
              orgIdManager.setOrgId(orgIdFromToken);
              config.headers['X-Org-Id'] = orgIdFromToken;
            }
            
            // Debug logging for /users/ endpoint
            if (config.url?.includes('/users/')) {
              console.log('ApiClient - Users API Request:', {
                url: config.url,
                hasToken: true,
                tokenLength: token.length,
                orgId: config.headers['X-Org-Id'],
                authHeader: config.headers.Authorization?.substring(0, 30) + '...'
              });
            }

          } else if (!isPublicEndpoint) {
            // Token expired - only redirect if not an auth endpoint
            localStorage.removeItem('authToken');
            // Prevent redirect loop
            if (!window.location.pathname.includes('/login')) {
              window.location.href = '/login?reason=token_expired';
            }
            return Promise.reject(new Error('Token expired'));
          }
        }
      } catch (e) {
        // Don't remove token on decode error - let backend validate
        // Still try to use the token
        config.headers.Authorization = `Bearer ${token}`;
      }
    } else if (!isPublicEndpoint) {
      // No token and not a public endpoint
      // Check if we're on a page that requires authentication
      const currentPath = window.location.pathname;
      const publicPaths = ['/login', '/register', '/setup', '/'];
      const isPublicPath = publicPaths.some(path => currentPath === path || currentPath.startsWith(path + '?'));
      
      if (!isPublicPath) {
        // Don't redirect immediately - let the API call fail with 401
        // The component can then handle the error appropriately
        // window.location.href = '/login?reason=not_authenticated';
        // return Promise.reject(new Error('Authentication required'));
      }
    }
    
    // Final check done silently
    
    // For auth endpoints or valid token, continue
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Handle specific status codes
    if (error.response?.status === 401) {
      // Check if this is actually a token issue or just missing auth
      const token = localStorage.getItem('authToken') || localStorage.getItem('auth_token');
      
      // Don't auto-redirect on 401 - let components handle it
      // This prevents redirect loops
      if (token) {
        // We had a token but it was rejected - likely expired
        // Don't auto-remove token or redirect - let user manually logout
        // localStorage.removeItem('authToken');
        // sessionStorage.clear(); // Clear any session data
        
        // Only redirect if not already on login/register/setup pages
        // if (!window.location.pathname.includes('/login') && 
        //     !window.location.pathname.includes('/register') &&
        //     !window.location.pathname.includes('/setup')) {
        //   window.location.href = '/login?reason=session_expired';
        // }
      }
      // If no token, just let the error bubble up without clearing anything
    } else if (error.response?.status === 404) {
      // For 404 errors, return a rejected promise with a custom flag
      // This prevents uncaught errors while allowing handlers to detect 404s
      const customError = {
        ...error,
        isNotFound: true,
        message: 'Resource not found'
      };
      return Promise.reject(customError);
    } else if (error.response?.status === 502 || error.response?.status === 503) {
      // Backend is down or restarting
      const customError = {
        ...error,
        isServiceUnavailable: true,
        message: 'Service temporarily unavailable. Please try again in a moment.'
      };
      return Promise.reject(customError);
    }
    
    // For other errors, create a proper error object
    const errorData = error.response?.data as any;
    const errorMessage = errorData?.detail || 
                        errorData?.message || 
                        error.message || 
                        'An unexpected error occurred';
    
    const customError = {
      ...error,
      message: errorMessage,
      status: error.response?.status
    };
    
    // For other errors, reject normally with better error structure
    return Promise.reject(customError);
  }
);

// ============= CUSTOMER APIs =============

export const customerAPI = {
  /**
   * Search customers using PostgreSQL function
   * Wraps: api.search_customers()
   */
  search: async (query: string, options?: {
    customerType?: string;
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get('/pg/customers/search', {
      params: {
        q: query,
        customer_type: options?.customerType,
        limit: options?.limit || 50,
        offset: options?.offset || 0,
      },
    });
    return response.data;
  },

  /**
   * Get customer details with ledger summary
   * Wraps: api.get_customer_details()
   */
  getDetails: async (customerId: number) => {
    const response = await apiClient.get(`/pg/customers/${customerId}`);
    return response.data;
  },

  /**
   * Create new customer
   * Wraps: api.create_customer()
   */
  create: async (customerData: any) => {
    const response = await apiClient.post('/pg/customers', customerData);
    return response.data;
  },

  /**
   * Get outstanding invoices for customer
   * Wraps: api.get_outstanding_invoices()
   */
  getOutstanding: async (customerId: number) => {
    const response = await apiClient.get(`/pg/customers/${customerId}/outstanding`);
    return response.data;
  },
};

// ============= PRODUCT APIs =============

export const productAPI = {
  /**
   * Search products with filters
   * Wraps: api.search_products()
   */
  search: async (query: string, options?: {
    categoryId?: number;
    isNarcotic?: boolean;
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get('/pg/products/search', {
      params: {
        q: query,
        category_id: options?.categoryId,
        is_narcotic: options?.isNarcotic,
        limit: options?.limit || 50,
        offset: options?.offset || 0,
      },
    });
    return response.data;
  },

  /**
   * Get real-time stock availability
   * Wraps: api.get_stock_availability()
   */
  getStock: async (productId: number, options?: {
    branchId?: number;
    includeReserved?: boolean;
  }) => {
    const response = await apiClient.get(`/pg/products/${productId}/stock`, {
      params: {
        branch_id: options?.branchId,
        include_reserved: options?.includeReserved || false,
      },
    });
    return response.data;
  },

  /**
   * Get product details (fallback to traditional endpoint)
   */
  getDetails: async (productId: number) => {
    const response = await apiClient.get(`/products/${productId}`);
    return response.data;
  },

  /**
   * Create new product
   * Wraps: api.create_product()
   */
  create: async (productData: any) => {
    const response = await apiClient.post('/pg/products', productData);
    return response.data;
  },

  /**
   * Update product
   * Wraps: api.update_product()
   */
  update: async (productId: number, productData: any) => {
    const response = await apiClient.put(`/pg/products/${productId}`, productData);
    return response.data;
  },
};

// ============= INVOICE APIs =============

export const invoiceAPI = {
  /**
   * Create new invoice with all calculations
   * Wraps: api.create_invoice()
   */
  create: async (invoiceData: {
    customer_id: number;
    invoice_date: string;
    items: Array<{
      product_id: number;
      quantity: number;
      batch_id?: number;
      rate: number;
      discount_percent?: number;
    }>;
    payment_terms?: string;
    due_days?: number;
    notes?: string;
  }) => {
    const response = await apiClient.post('/pg/invoices', {
      invoice_data: invoiceData
    });
    return response.data;
  },

  /**
   * Get complete invoice details
   * Wraps: api.get_invoice_details()
   */
  getDetails: async (invoiceId: number) => {
    const response = await apiClient.get(`/pg/invoices/${invoiceId}`);
    return response.data;
  },

  /**
   * Search invoices with filters
   * Wraps: api.search_invoices()
   */
  search: async (filters?: {
    customerId?: number;
    fromDate?: string;
    toDate?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get('/pg/invoices', {
      params: {
        customer_id: filters?.customerId,
        from_date: filters?.fromDate,
        to_date: filters?.toDate,
        status: filters?.status,
        limit: filters?.limit || 50,
        offset: filters?.offset || 0,
      },
    });
    return response.data;
  },
};

// ============= SUPPLIER APIs =============

export const supplierAPI = {
  /**
   * Search suppliers
   * Wraps: api.search_suppliers()
   */
  search: async (query: string, options?: {
    supplierType?: string;
    limit?: number;
    offset?: number;
  }) => {
    const response = await apiClient.get('/pg/suppliers/search', {
      params: {
        q: query,
        supplier_type: options?.supplierType,
        limit: options?.limit || 50,
        offset: options?.offset || 0,
      },
    });
    return response.data;
  },

  /**
   * Get supplier details
   * Wraps: api.get_supplier_details()
   */
  getDetails: async (supplierId: number) => {
    const response = await apiClient.get(`/pg/suppliers/${supplierId}`);
    return response.data;
  },

  /**
   * Create new supplier
   * Wraps: api.create_supplier()
   */
  create: async (supplierData: any) => {
    const response = await apiClient.post('/pg/suppliers', supplierData);
    return response.data;
  },

  /**
   * Update supplier
   * Wraps: api.update_supplier()
   */
  update: async (supplierId: number, supplierData: any) => {
    const response = await apiClient.put(`/pg/suppliers/${supplierId}`, supplierData);
    return response.data;
  },
};

// ============= PAYMENT APIs =============

export const paymentAPI = {
  /**
   * Record customer payment with auto-allocation
   * Wraps: api.record_payment()
   */
  record: async (paymentData: {
    customer_id: number;
    payment_date: string;
    amount: number;
    payment_mode: string;
    reference_number?: string;
    allocations?: Array<{
      invoice_id: number;
      amount: number;
    }>;
  }) => {
    const response = await apiClient.post('/pg/payments', {
      payment_data: paymentData
    });
    return response.data;
  },
};

// ============= BATCH APIs =============

export const batchAPI = {
  /**
   * Get batches for a specific product
   * Wraps: api.get_product_batches()
   */
  getByProduct: async (productId: number) => {
    const response = await apiClient.get(`/pg/products/${productId}/batches`);
    return response.data;
  },

  /**
   * Get batch details
   * Wraps: api.get_batch_details()
   */
  getDetails: async (batchId: number) => {
    const response = await apiClient.get(`/pg/batches/${batchId}`);
    return response.data;
  },

  /**
   * Search batches with filters
   */
  search: async (filters: {
    productId?: number;
    expiryAfter?: string;
    inStock?: boolean;
  }) => {
    const response = await apiClient.get('/pg/batches/search', {
      params: filters,
    });
    return response.data;
  },
};

// ============= INVENTORY APIs =============

export const inventoryAPI = {
  /**
   * Get products requiring reorder
   * Wraps: api.get_reorder_alerts()
   */
  getReorderAlerts: async (options?: {
    branchId?: number;
    categoryId?: number;
  }) => {
    const response = await apiClient.get('/pg/inventory/reorder-alerts', {
      params: {
        branch_id: options?.branchId,
        category_id: options?.categoryId,
      },
    });
    return response.data;
  },

  /**
   * Get items expiring soon
   * Wraps: api.get_expiring_items()
   */
  getExpiringItems: async (daysToExpiry: number = 30, branchId?: number) => {
    const response = await apiClient.get('/pg/inventory/expiring-items', {
      params: {
        days_to_expiry: daysToExpiry,
        branch_id: branchId,
      },
    });
    return response.data;
  },
};

// ============= DASHBOARD APIs =============

export const dashboardAPI = {
  /**
   * Get comprehensive dashboard statistics
   * Wraps: api.get_dashboard_summary()
   */
  getStats: async (branchId?: number) => {
    const response = await apiClient.get('/pg/dashboard/stats', {
      params: {
        branch_id: branchId,
      },
    });
    return response.data;
  },

  /**
   * Get sales analytics with trends
   * Wraps: api.get_sales_analytics()
   */
  getSalesAnalytics: async (params: {
    fromDate: string;
    toDate: string;
    groupBy?: 'day' | 'week' | 'month';
    branchId?: number;
  }) => {
    const response = await apiClient.get('/pg/dashboard/sales-analytics', {
      params: {
        from_date: params.fromDate,
        to_date: params.toDate,
        group_by: params.groupBy || 'day',
        branch_id: params.branchId,
      },
    });
    return response.data;
  },
};

// ============= GST APIs =============

export const gstAPI = {
  /**
   * Generate GSTR-1 data
   * Wraps: api.generate_gstr1_data()
   */
  generateGSTR1: async (month: number, year: number) => {
    const response = await apiClient.get('/pg/gst/gstr1', {
      params: { month, year },
    });
    return response.data;
  },
};

// ============= ORDERS APIs =============

export const ordersAPI = {
  search: async (filters?: any) => {
    const response = await apiClient.get('/pg/orders', { params: filters });
    return response.data;
  },
  getDetails: async (orderId: number) => {
    const response = await apiClient.get(`/pg/orders/${orderId}`);
    return response.data;
  },
};

// ============= PURCHASES APIs =============

export const purchasesAPI = {
  search: async (filters?: any) => {
    const response = await apiClient.get('/pg/purchases', { params: filters });
    return response.data;
  },
  getDetails: async (purchaseId: number) => {
    const response = await apiClient.get(`/pg/purchases/${purchaseId}`);
    return response.data;
  },
};

// ============= CHALLANS APIs =============

export const challansAPI = {
  search: async (filters?: any) => {
    const response = await apiClient.get('/pg/challans', { params: filters });
    return response.data;
  },
  getDetails: async (challanId: number) => {
    const response = await apiClient.get(`/pg/challans/${challanId}`);
    return response.data;
  },
};

// ============= SALES ORDERS APIs =============

export const salesOrdersAPI = {
  search: async (filters?: any) => {
    const response = await apiClient.get('/pg/sales-orders', { params: filters });
    return response.data;
  },
  getDetails: async (orderId: number) => {
    const response = await apiClient.get(`/pg/sales-orders/${orderId}`);
    return response.data;
  },
};

// ============= PARTY LEDGER APIs =============

export const partyLedgerAPI = {
  /**
   * Get party ledger balance
   */
  getBalance: async (partyId: number, partyType: 'customer' | 'supplier') => {
    const response = await apiClient.get(`/pg/ledger/${partyType}/${partyId}/balance`);
    return response.data;
  },

  /**
   * Get party statement
   */
  getStatement: async (partyId: number, partyType: 'customer' | 'supplier', dateRange?: {
    fromDate: string;
    toDate: string;
  }) => {
    const response = await apiClient.get(`/pg/ledger/${partyType}/${partyId}/statement`, {
      params: dateRange,
    });
    return response.data;
  },

  /**
   * Get outstanding bills
   */
  getOutstandingBills: async (partyId: number, partyType: 'customer' | 'supplier') => {
    const response = await apiClient.get(`/pg/ledger/${partyType}/${partyId}/outstanding`);
    return response.data;
  },

  /**
   * Get aging analysis
   */
  getAgingAnalysis: async (partyId: number, partyType: 'customer' | 'supplier') => {
    const response = await apiClient.get(`/pg/ledger/${partyType}/${partyId}/aging`);
    return response.data;
  },
};

// Export apiHelpers for backward compatibility
export const apiHelpers = {
  get: (url: string, config?: any) => apiClient.get(url, config),
  post: (url: string, data?: any, config?: any) => apiClient.post(url, data, config),
  put: (url: string, data?: any, config?: any) => apiClient.put(url, data, config),
  delete: (url: string, config?: any) => apiClient.delete(url, config),
  patch: (url: string, data?: any, config?: any) => apiClient.patch(url, data, config),
};

// Export the base client for custom requests
export default apiClient;