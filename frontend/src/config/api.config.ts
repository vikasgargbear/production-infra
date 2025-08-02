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
  // Base URL configuration - use HTTPS directly (Railway forces HTTPS anyway)
  BASE_URL: process.env.REACT_APP_API_BASE_URL || 'https://pharma-backend-production-0c09.up.railway.app',
  
  // API Version
  API_VERSION: '/api/v1',
  
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
      BASE: '/products',
      SEARCH: '/products/search',
      BATCH_UPLOAD: '/products/batch-upload',
      CATEGORIES: '/products/categories',
      STOCK_UPDATE: '/products/stock-update',
    },
    
    // Customers
    CUSTOMERS: {
      BASE: '/customers',
      SEARCH: '/customers/search',
      CREDIT_CHECK: '/customers/credit-check',
      TRANSACTIONS: '/customers/transactions',
    },
    
    // Suppliers
    SUPPLIERS: {
      BASE: '/suppliers/',
      SEARCH: '/suppliers/search',
      TRANSACTIONS: '/suppliers/transactions',
    },
    
    // Purchases
    PURCHASES: {
      BASE: '/purchases',
      ENHANCED: '/purchases-enhanced',
      PDF_PARSE: '/purchase-upload/parse-invoice-safe',
      PENDING_RECEIPTS: '/purchases-enhanced/pending-receipts',
      RECEIVE_ITEMS: (id) => `/purchases-enhanced/${id}/receive-fixed`,
    },
    
    // Sales & Invoices
    SALES: {
      BASE: '/sales',
      DIRECT_INVOICE: '/sales/direct-invoice-sale',
      INVOICE_SEARCH: '/sales/invoices/search',
    },
    
    INVOICES: {
      BASE: '/invoices',
      CALCULATE: '/invoices/calculate-live',
      VALIDATE: '/invoices/validate',
      GENERATE_NUMBER: '/invoices/generate-number',
      DRAFTS: '/invoices/drafts',
      PDF: (id) => `/invoices/${id}/pdf`,
      WHATSAPP: (id) => `/invoices/${id}/whatsapp`,
    },
    
    // Challans (implemented as Orders with order_type='challan')
    // Note: Backend challan endpoints have schema issues, so we use orders instead
    CHALLANS: {
      BASE: '/orders', // Using orders endpoint with order_type filter
      CONVERT_TO_INVOICE: (id) => `/orders/${id}/generate-invoice`,
      UPDATE_STATUS: (id) => `/orders/${id}/delivery-status`,
      PDF: (id) => `/orders/${id}/pdf`,
      WHATSAPP: (id) => `/orders/${id}/whatsapp`,
    },
    
    // Orders (confirmed table exists)
    ORDERS: {
      BASE: '/orders',
      CREATE: '/orders',
      CONFIRM: (id) => `/orders/${id}/confirm`,
      CANCEL: (id) => `/orders/${id}/cancel`,
      GENERATE_INVOICE: (id) => `/orders/${id}/generate-invoice`,
      ITEMS: '/order-items',
    },
    
    // Sales Orders (enterprise-grade API)
    SALES_ORDERS: {
      BASE: '/sales-orders',
      CREATE: '/sales-orders',
      VALIDATE: '/sales-orders/validate',
      SEARCH: '/sales-orders/search',
      APPROVE: (id) => `/sales-orders/${id}/approve`,
      CONVERT_TO_INVOICE: (id) => `/sales-orders/${id}/convert-to-invoice`,
      CONVERT_TO_CHALLAN: (id) => `/sales-orders/${id}/convert-to-challan`,
    },
    
    // Inventory
    INVENTORY: {
      BATCHES: '/batches',
      MOVEMENTS: '/inventory-movements',
      STOCK_LEVELS: '/inventory/stock-levels',
      ADJUSTMENTS: '/inventory/adjustments',
      REPORTS: '/inventory/reports',
    },
    
    // Payments
    PAYMENTS: {
      BASE: '/payments',
      RECONCILE: '/payments/reconcile',
      PENDING: '/payments/pending',
      METHODS: '/payments/methods',
    },
    
    // Returns
    RETURNS: {
      BASE: '/returns',
      APPROVE: (id) => `/returns/${id}/approve`,
      REJECT: (id) => `/returns/${id}/reject`,
      CUSTOMER_RETURNS: '/returns/customer',
      SUPPLIER_RETURNS: '/returns/supplier',
    },
    
    // Party Ledger
    LEDGER: {
      BASE: '/ledger',
      PARTY: (partyId) => `/ledger/party/${partyId}`,
      STATEMENTS: '/ledger/statements',
      OUTSTANDING: '/ledger/outstanding',
      AGING: '/ledger/aging',
    },
    
    // Credit/Debit Notes
    NOTES: {
      CREDIT: '/credit-notes',
      DEBIT: '/debit-notes',
      APPROVE: (type, id) => `/${type}-notes/${id}/approve`,
      CANCEL: (type, id) => `/${type}-notes/${id}/cancel`,
    },
    
    // Stock Movement
    STOCK: {
      BASE: '/stock',
      MOVEMENTS: '/stock-movements',
      RECEIVE: '/stock-movements/receive',
      ISSUE: '/stock-movements/issue',
      TRANSFER: '/stock-movements/transfer',
      ADJUST: '/stock-movements/adjust',
    },
    
    // Reports & Analytics
    REPORTS: {
      DASHBOARD: '/dashboard',
      SALES_REPORT: '/reports/sales',
      PURCHASE_REPORT: '/reports/purchases',
      INVENTORY_REPORT: '/reports/inventory',
      CUSTOMER_REPORT: '/reports/customers',
      GST_REPORTS: {
        GSTR1: '/reports/gst/gstr1',
        GSTR3B: '/reports/gst/gstr3b',
      },
    },
    
    // Settings
    SETTINGS: {
      COMPANY: '/settings/company',
      PREFERENCES: '/settings/preferences',
      USERS: '/users',
      ROLES: '/roles',
      PERMISSIONS: '/permissions',
    },
    
    // Utilities
    UTILS: {
      SEARCH: '/search',
      EXPORT: '/export',
      IMPORT: '/import',
      BACKUP: '/backup',
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