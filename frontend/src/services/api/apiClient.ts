/**
 * API Client for PostgreSQL Function Wrappers
 * Uses new /api/v2/pg/* endpoints that wrap PostgreSQL functions
 */

import axios, { AxiosInstance, AxiosError } from 'axios';

// Get API URL from environment or use default
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const API_VERSION = 'v2';

// Create axios instance with default config
const apiClient: AxiosInstance = axios.create({
  baseURL: `${API_BASE_URL}/api/${API_VERSION}`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Request interceptor for auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
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
    if (error.response?.status === 401) {
      // Handle unauthorized - redirect to login
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
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

// Export the base client for custom requests
export default apiClient;