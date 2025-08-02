/**
 * API Configuration
 */

export const API_CONFIG = {
  baseURL: process.env.REACT_APP_API_BASE_URL || 'http://localhost:8000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
  AUTH: {
    TOKEN_KEY: 'pharma_token',
    USER_KEY: 'pharma_user',
  },
  ERROR_MESSAGES: {
    NETWORK_ERROR: 'Network error. Please check your connection.',
    UNAUTHORIZED: 'You are not authorized to perform this action.',
    SERVER_ERROR: 'Server error. Please try again later.',
  },
  ENDPOINTS: {
    CUSTOMERS: {
      BASE: '/api/customers',
      SEARCH: '/api/customers/search',
      CREDIT_CHECK: '/api/customers/credit-check',
      TRANSACTIONS: '/api/customers/transactions',
    },
    PRODUCTS: {
      BASE: '/api/products',
      SEARCH: '/api/products/search',
      CATEGORIES: '/api/products/categories',
      STOCK_UPDATE: '/api/products/stock-update',
      BATCH_UPLOAD: '/api/products/batch-upload',
    },
    AUTH: {
      LOGIN: '/api/auth/login',
      LOGOUT: '/api/auth/logout',
      REFRESH: '/api/auth/refresh',
      PROFILE: '/api/auth/profile',
    },
  },
};

export const API_ENDPOINTS = {
  // Customer endpoints
  customers: {
    list: '/api/customers',
    detail: (id: number) => `/api/customers/${id}`,
    create: '/api/customers',
    update: (id: number) => `/api/customers/${id}`,
    delete: (id: number) => `/api/customers/${id}`,
    search: '/api/customers/search',
    checkCredit: (id: number) => `/api/customers/${id}/check-credit`,
  },
  
  // Product endpoints
  products: {
    list: '/api/products',
    detail: (id: number) => `/api/products/${id}`,
    create: '/api/products',
    update: (id: number) => `/api/products/${id}`,
    delete: (id: number) => `/api/products/${id}`,
    search: '/api/products/search',
    checkStock: (id: number) => `/api/products/${id}/check-stock`,
    updateStock: (id: number) => `/api/products/${id}/update-stock`,
    batches: (id: number) => `/api/products/${id}/batches`,
  },
  
  // Auth endpoints
  auth: {
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    refresh: '/api/auth/refresh',
    profile: '/api/auth/profile',
  },
};

export default API_CONFIG;