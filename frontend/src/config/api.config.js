/**
 * API Configuration
 * Central configuration for all API endpoints
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://pharma-backend-production-0c09.up.railway.app/api';

export const API_CONFIG = {
  BASE_URL: API_BASE_URL,
  TIMEOUT: 30000,
  
  // Storage keys
  AUTH: {
    USER_KEY: 'pharma_user',
    TOKEN_KEY: 'pharma_token'
  },
  
  ENDPOINTS: {
    // Authentication
    AUTH: {
      LOGIN: '/auth/login',
      LOGOUT: '/auth/logout',
      REFRESH: '/auth/refresh',
      PROFILE: '/auth/profile',
      CHANGE_PASSWORD: '/auth/change-password'
    },
    
    // Master Data
    CUSTOMERS: {
      BASE: '/customers',
      SEARCH: '/customers/search',
      CREATE: '/customers',
      UPDATE: (id) => `/customers/${id}`,
      DELETE: (id) => `/customers/${id}`,
      DETAILS: (id) => `/customers/${id}`,
      OUTSTANDING: (id) => `/customers/${id}/outstanding`,
      TRANSACTIONS: (id) => `/customers/${id}/transactions`
    },
    
    SUPPLIERS: {
      BASE: '/suppliers',
      SEARCH: '/suppliers/search',
      CREATE: '/suppliers',
      UPDATE: (id) => `/suppliers/${id}`,
      DELETE: (id) => `/suppliers/${id}`,
      DETAILS: (id) => `/suppliers/${id}`,
      OUTSTANDING: (id) => `/suppliers/${id}/outstanding`
    },
    
    PRODUCTS: {
      BASE: '/products',
      SEARCH: '/products/search',
      CREATE: '/products',
      UPDATE: (id) => `/products/${id}`,
      DELETE: (id) => `/products/${id}`,
      DETAILS: (id) => `/products/${id}`,
      BATCHES: (id) => `/products/${id}/batches`,
      STOCK: (id) => `/products/${id}/stock`,
      PRICE_HISTORY: (id) => `/products/${id}/price-history`
    },
    
    // Sales Module
    SALES: {
      BASE: '/sales',
      CREATE_INVOICE: '/sales/create-invoice',
      CREATE_QUICK: '/sales/quick-sale',
      GET_INVOICE: (id) => `/sales/invoice/${id}`,
      PRINT_INVOICE: (id) => `/sales/invoice/${id}/print`,
      CANCEL_INVOICE: (id) => `/sales/invoice/${id}/cancel`
    },
    
    INVOICES: {
      BASE: '/invoices',
      CREATE: '/invoices',
      UPDATE: (id) => `/invoices/${id}`,
      DELETE: (id) => `/invoices/${id}`,
      DETAILS: (id) => `/invoices/${id}`,
      PDF: (id) => `/invoices/${id}/pdf`,
      EMAIL: (id) => `/invoices/${id}/email`,
      CANCEL: (id) => `/invoices/${id}/cancel`,
      HISTORY: '/invoices/history'
    },
    
    ORDERS: {
      BASE: '/orders',
      CREATE: '/orders',
      UPDATE: (id) => `/orders/${id}`,
      DELETE: (id) => `/orders/${id}`,
      DETAILS: (id) => `/orders/${id}`,
      CONFIRM: (id) => `/orders/${id}/confirm`,
      CANCEL: (id) => `/orders/${id}/cancel`,
      CONVERT_TO_INVOICE: (id) => `/orders/${id}/convert-to-invoice`
    },
    
    CHALLANS: {
      BASE: '/enterprise-delivery-challan',
      CREATE: '/enterprise-delivery-challan',
      UPDATE: (id) => `/enterprise-delivery-challan/${id}`,
      DELETE: (id) => `/enterprise-delivery-challan/${id}`,
      DETAILS: (id) => `/enterprise-delivery-challan/${id}`,
      PDF: (id) => `/enterprise-delivery-challan/${id}/pdf`,
      CONVERT_TO_INVOICE: (id) => `/enterprise-delivery-challan/${id}/convert-to-invoice`
    },
    
    // Purchase Module
    PURCHASES: {
      BASE: '/purchases/',  // Added trailing slash for proper routing
      ENHANCED: '/purchase-enhanced',
      CREATE: '/purchases',
      UPDATE: (id) => `/purchases/${id}`,
      DELETE: (id) => `/purchases/${id}`,
      DETAILS: (id) => `/purchases/${id}`,
      PDF_PARSE: '/purchase-upload/parse-pdf',  // PDF parsing endpoint
      UPLOAD_INVOICE: '/purchase-upload/invoice',
      PENDING_RECEIPTS: '/purchases/pending-receipts',
      RECEIVE_ITEMS: (id) => `/purchases/${id}/receive`,
      GENERATE_NUMBER: '/purchases/generate-number'
    },

    // GRN (Goods Receipt Notes)
    GRN: {
      BASE: '/grn',
      CREATE: '/grn',
      UPDATE: (id) => `/grn/${id}`,
      DETAILS: (id) => `/grn/${id}`,
      APPROVE: (id) => `/grn/${id}/approve`,
      GENERATE_NUMBER: '/grn/generate-number'
    },
    
    // Stock Management
    STOCK: {
      BASE: '/inventory',
      ADJUSTMENTS: '/stock-adjustments/',
      MOVEMENTS: '/stock-movements/',
      CURRENT: '/inventory/current',
      BATCHES: '/inventory/batches',
      EXPIRING: '/inventory/expiring',
      LOW_STOCK: '/inventory/low-stock',
      TRANSFER: '/stock-transfers',
      RECEIVE: '/stock/receive'
    },
    
    // Financial
    PAYMENTS: {
      BASE: '/payments',
      CREATE: '/payments',
      UPDATE: (id) => `/payments/${id}`,
      DELETE: (id) => `/payments/${id}`,
      DETAILS: (id) => `/payments/${id}`,
      RECEIPTS: '/payments/receipts',
      OUTSTANDING: '/payments/outstanding',
      LEDGER: '/party-ledger-v2'
    },
    
    // Returns
    RETURNS: {
      BASE: '/returns',
      SALES: '/sale-returns/',  // Added trailing slash
      PURCHASES: '/purchase-returns/',  // Added trailing slash
      CUSTOMER_RETURNS: '/sale-returns/',  // Added trailing slash
      SUPPLIER_RETURNS: '/purchase-returns/',  // Added trailing slash
      CREATE_SALE_RETURN: '/sale-returns/',  // Added trailing slash
      CREATE_PURCHASE_RETURN: '/purchase-returns/',  // Added trailing slash
      APPROVE: (id) => `/returns/${id}/approve`,
      REJECT: (id) => `/returns/${id}/reject`,
      RETURNABLE_ITEMS: '/returns/returnable-items'
    },
    
    // Reports
    REPORTS: {
      SALES: '/reports/sales',
      PURCHASES: '/reports/purchases',
      INVENTORY: '/reports/inventory',
      FINANCIAL: '/reports/financial',
      GST: '/reports/gst',
      CUSTOM: '/reports/custom',
      EXPORT: '/reports/export'
    },
    
    // Dashboard
    DASHBOARD: {
      BASE: '/dashboard',
      SALES_SUMMARY: '/dashboard/sales-summary',
      INVENTORY_SUMMARY: '/dashboard/inventory-summary',
      FINANCIAL_SUMMARY: '/dashboard/financial-summary',
      NOTIFICATIONS: '/dashboard/notifications'
    },
    
    // Users & Settings
    USERS: {
      BASE: '/users',
      CREATE: '/users',
      UPDATE: (id) => `/users/${id}`,
      DELETE: (id) => `/users/${id}`,
      ROLES: '/users/roles',
      PERMISSIONS: '/users/permissions'
    },
    
    SETTINGS: {
      COMPANY: '/company',
      UPDATE_COMPANY: '/company/update',
      PREFERENCES: '/settings/preferences',
      TAX_SETTINGS: '/settings/tax',
      PRINT_SETTINGS: '/settings/print',
      EMAIL_SETTINGS: '/settings/email'
    }
  },
  
  // HTTP Status codes
  STATUS: {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
  },
  
  // Error messages
  ERRORS: {
    NETWORK: 'Network error. Please check your internet connection.',
    TIMEOUT: 'Request timed out. Please try again.',
    UNAUTHORIZED: 'You are not authorized. Please login again.',
    FORBIDDEN: 'You do not have permission to perform this action.',
    NOT_FOUND: 'Requested resource not found.',
    SERVER: 'Server error. Please try again later.',
    VALIDATION: 'Please check your input and try again.'
  }
};

// Helper function to construct full URL
export const getApiUrl = (endpoint) => {
  if (endpoint.startsWith('http')) {
    return endpoint;
  }
  return `${API_BASE_URL}${endpoint}`;
};

// Export for backward compatibility
export default API_CONFIG;