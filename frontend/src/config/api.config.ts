// API Configuration
// Centralized configuration for all API endpoints and settings

// Type definitions for TypeScript files
export interface APIConfig {
  BASE_URL: string;
  API_VERSION: string;
  TIMEOUT: number;
  RETRY_ATTEMPTS: number;
  RETRY_DELAY: number;
  DEFAULT_HEADERS: Record<string, string>;
  AUTH: {
    TOKEN_KEY: string;
    USER_KEY: string;
    REFRESH_TOKEN_KEY: string;
  };
  ENDPOINTS: Record<string, any>;
  ERROR_MESSAGES: Record<string, string>;
  SUCCESS_MESSAGES: Record<string, string>;
}

export const API_CONFIG: APIConfig = {
  // Base URL configuration - use HTTP to avoid CORS preflight redirect issues
  BASE_URL: process.env.REACT_APP_API_BASE_URL || 'http://pharma-backend-production-0c09.up.railway.app',
  
  // API Version - consolidated, no version numbers
  API_VERSION: '/api',
  
  // Timeout settings
  TIMEOUT: 30000, // 30 seconds
  
  // Retry configuration
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  
  // Headers
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  
  // Auth configuration
  AUTH: {
    TOKEN_KEY: 'authToken',
    USER_KEY: 'currentUser',
    REFRESH_TOKEN_KEY: 'refreshToken',
  },
  
  // API Endpoints organized by domain
  ENDPOINTS: {
    // Authentication
    AUTH: {
      LOGIN: '/auth/login',
      LOGOUT: '/auth/logout',
      REFRESH: '/auth/refresh',
      VERIFY: '/auth/verify',
      REGISTER: '/auth/register',
    },
    
    // Products
    PRODUCTS: {
      BASE: '/products/',  // Added trailing slash to prevent 307 redirects
      SEARCH: '/products/search/',  // Added trailing slash
      CREATE: '/products/',  // POST endpoint for creation - trailing slash required!
      BATCH_UPLOAD: '/products/batch-upload/',  // Added trailing slash
      CATEGORIES: '/products/categories/',  // Added trailing slash
      STOCK_UPDATE: '/products/stock-update/',  // Added trailing slash
    },
    
    // Customers
    CUSTOMERS: {
      BASE: '/customers/',  // Added trailing slash
      SEARCH: '/customers/',  // Use same endpoint with search param - Added trailing slash
      CREDIT_CHECK: '/customers/credit-check/',  // Added trailing slash
      TRANSACTIONS: '/customers/transactions/',  // Added trailing slash
    },
    
    // Suppliers
    SUPPLIERS: {
      BASE: '/suppliers/',  // Added trailing slash
      SEARCH: '/suppliers/',  // Use same endpoint with search param - Added trailing slash
      TRANSACTIONS: '/suppliers/transactions/',  // Added trailing slash
    },
    
    // Purchases
    PURCHASES: {
      BASE: '/purchases/',  // Added trailing slash
      ENHANCED: '/purchases-enhanced/',  // Added trailing slash
      PDF_PARSE: '/purchase-upload/parse-invoice-safe/',  // Added trailing slash
      PENDING_RECEIPTS: '/purchases-enhanced/pending-receipts/',  // Added trailing slash
      RECEIVE_ITEMS: (id) => `/purchases-enhanced/${id}/receive-fixed/`,  // Added trailing slash
    },
    
    // Sales & Invoices
    SALES: {
      BASE: '/sales/',  // Added trailing slash
      DIRECT_INVOICE: '/sales/direct-invoice-sale/',  // Added trailing slash
      INVOICE_SEARCH: '/sales/invoices/search/',  // Added trailing slash
    },
    
    INVOICES: {
      BASE: '/invoices/',  // Added trailing slash
      CALCULATE: '/invoices/calculate-live/',  // Added trailing slash
      VALIDATE: '/invoices/validate/',  // Added trailing slash
      GENERATE_NUMBER: '/invoices/generate-number/',  // Added trailing slash
      DRAFTS: '/invoices/drafts/',  // Added trailing slash
      PDF: (id) => `/invoices/${id}/pdf/`,  // Added trailing slash
      WHATSAPP: (id) => `/invoices/${id}/whatsapp/`,  // Added trailing slash
    },
    
    // Challans (implemented as Orders with order_type='challan')
    // Note: Backend challan endpoints have schema issues, so we use orders instead
    CHALLANS: {
      BASE: '/orders/', // Using orders endpoint with order_type filter - Added trailing slash
      CONVERT_TO_INVOICE: (id) => `/orders/${id}/generate-invoice/`,  // Added trailing slash
      UPDATE_STATUS: (id) => `/orders/${id}/delivery-status/`,  // Added trailing slash
      PDF: (id) => `/orders/${id}/pdf/`,  // Added trailing slash
      WHATSAPP: (id) => `/orders/${id}/whatsapp/`,  // Added trailing slash
    },
    
    // Orders (confirmed table exists)
    ORDERS: {
      BASE: '/orders/',  // Added trailing slash
      CREATE: '/orders/',  // Added trailing slash
      CONFIRM: (id) => `/orders/${id}/confirm/`,  // Added trailing slash
      CANCEL: (id) => `/orders/${id}/cancel/`,  // Added trailing slash
      GENERATE_INVOICE: (id) => `/orders/${id}/generate-invoice/`,  // Added trailing slash
      ITEMS: '/order-items/',  // Added trailing slash
    },
    
    // Sales Orders (enterprise-grade API)
    SALES_ORDERS: {
      BASE: '/sales-orders/',  // Added trailing slash
      CREATE: '/sales-orders/',  // Added trailing slash
      VALIDATE: '/sales-orders/validate/',  // Added trailing slash
      SEARCH: '/sales-orders/search/',  // Added trailing slash
      APPROVE: (id) => `/sales-orders/${id}/approve/`,  // Added trailing slash
      CONVERT_TO_INVOICE: (id) => `/sales-orders/${id}/convert-to-invoice/`,  // Added trailing slash
      CONVERT_TO_CHALLAN: (id) => `/sales-orders/${id}/convert-to-challan/`,  // Added trailing slash
    },
    
    // Inventory
    INVENTORY: {
      BATCHES: '/batches/',  // Added trailing slash
      MOVEMENTS: '/inventory-movements/',  // Added trailing slash
      STOCK_LEVELS: '/inventory/stock-levels/',  // Added trailing slash
      ADJUSTMENTS: '/inventory/adjustments/',  // Added trailing slash
      REPORTS: '/inventory/reports/',  // Added trailing slash
    },
    
    // Payments
    PAYMENTS: {
      BASE: '/payments/',  // Added trailing slash
      RECONCILE: '/payments/reconcile/',  // Added trailing slash
      PENDING: '/payments/pending/',  // Added trailing slash
      METHODS: '/payments/methods/',  // Added trailing slash
    },
    
    // Returns
    RETURNS: {
      BASE: '/returns/',  // Added trailing slash
      APPROVE: (id) => `/returns/${id}/approve/`,  // Added trailing slash
      REJECT: (id) => `/returns/${id}/reject/`,  // Added trailing slash
      CUSTOMER_RETURNS: '/returns/customer/',  // Added trailing slash
      SUPPLIER_RETURNS: '/returns/supplier/',  // Added trailing slash
    },
    
    // Party Ledger
    LEDGER: {
      BASE: '/ledger/',  // Added trailing slash
      PARTY: (partyId) => `/ledger/party/${partyId}/`,  // Added trailing slash
      STATEMENTS: '/ledger/statements/',  // Added trailing slash
      OUTSTANDING: '/ledger/outstanding/',  // Added trailing slash
      AGING: '/ledger/aging/',  // Added trailing slash
    },
    
    // Credit/Debit Notes
    NOTES: {
      CREDIT: '/credit-notes/',  // Added trailing slash
      DEBIT: '/debit-notes/',  // Added trailing slash
      APPROVE: (type, id) => `/${type}-notes/${id}/approve/`,  // Added trailing slash
      CANCEL: (type, id) => `/${type}-notes/${id}/cancel/`,  // Added trailing slash
    },
    
    // Stock Movement
    STOCK: {
      BASE: '/stock/',  // Added trailing slash
      MOVEMENTS: '/stock-movements/',  // Added trailing slash
      RECEIVE: '/stock-movements/receive/',  // Added trailing slash
      ISSUE: '/stock-movements/issue/',  // Added trailing slash
      TRANSFER: '/stock-movements/transfer/',  // Added trailing slash
      ADJUST: '/stock-movements/adjust/',  // Added trailing slash
    },
    
    // Reports & Analytics
    REPORTS: {
      DASHBOARD: '/dashboard/',  // Added trailing slash
      SALES_REPORT: '/reports/sales/',  // Added trailing slash
      PURCHASE_REPORT: '/reports/purchases/',  // Added trailing slash
      INVENTORY_REPORT: '/reports/inventory/',  // Added trailing slash
      CUSTOMER_REPORT: '/reports/customers/',  // Added trailing slash
      GST_REPORTS: {
        GSTR1: '/reports/gst/gstr1/',  // Added trailing slash
        GSTR3B: '/reports/gst/gstr3b/',  // Added trailing slash
      },
    },
    
    // Settings
    SETTINGS: {
      COMPANY: '/settings/company/',  // Added trailing slash
      PREFERENCES: '/settings/preferences/',  // Added trailing slash
      USERS: '/users/',  // Added trailing slash
      ROLES: '/roles/',  // Added trailing slash
      PERMISSIONS: '/permissions/',  // Added trailing slash
    },
    
    // Utilities
    UTILS: {
      SEARCH: '/search/',  // Added trailing slash
      EXPORT: '/export/',  // Added trailing slash
      IMPORT: '/import/',  // Added trailing slash
      BACKUP: '/backup/',  // Added trailing slash
    },
  },
  
  // Error messages
  ERROR_MESSAGES: {
    NETWORK_ERROR: 'Network error. Please check your connection.',
    TIMEOUT_ERROR: 'Request timed out. Please try again.',
    UNAUTHORIZED: 'You are not authorized. Please login again.',
    SERVER_ERROR: 'Server error. Please try again later.',
    VALIDATION_ERROR: 'Please check your input and try again.',
  },
  
  // Success messages
  SUCCESS_MESSAGES: {
    CREATED: 'Created successfully',
    UPDATED: 'Updated successfully',
    DELETED: 'Deleted successfully',
    SAVED: 'Saved successfully',
  },
};

// Helper function to build full URL
export const buildUrl = (endpoint) => {
  return `${API_CONFIG.BASE_URL}${API_CONFIG.API_VERSION}${endpoint}`;
};

// Helper function to get auth token
export const getAuthToken = () => {
  return localStorage.getItem(API_CONFIG.AUTH.TOKEN_KEY);
};

// Helper function to set auth token
export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem(API_CONFIG.AUTH.TOKEN_KEY, token);
  } else {
    localStorage.removeItem(API_CONFIG.AUTH.TOKEN_KEY);
  }
};

// Helper function to check if user is authenticated
export const isAuthenticated = () => {
  return !!getAuthToken();
};

export default API_CONFIG;