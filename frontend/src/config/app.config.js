/**
 * Global Application Configuration
 * Centralized configuration for application-wide settings
 */

export const APP_CONFIG = {
  // Application Info
  APP_NAME: 'Pharma Management System',
  APP_VERSION: '1.0.0',
  COMPANY_NAME: 'Your Pharmacy Name',
  
  // API Configuration
  API: {
    BASE_URL: process.env.REACT_APP_API_BASE_URL || 'https://pharma-backend-production-0c09.up.railway.app',
    VERSION: 'v1',
    TIMEOUT: 30000, // 30 seconds
    HEADERS: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  },

  // Authentication
  AUTH: {
    TOKEN_KEY: 'authToken',
    USER_KEY: 'userData',
    ORG_KEY: 'orgId',
    REFRESH_TOKEN_KEY: 'refreshToken',
    TOKEN_EXPIRY_BUFFER: 5 * 60 * 1000, // 5 minutes before expiry
  },

  // Localization
  LOCALE: {
    DEFAULT: 'en-IN',
    CURRENCY: 'INR',
    CURRENCY_SYMBOL: '₹',
    DATE_FORMAT: 'DD-MM-YYYY',
    TIME_FORMAT: 'hh:mm A',
    TIMEZONE: 'Asia/Kolkata'
  },

  // File Upload
  UPLOAD: {
    MAX_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],
    IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/jpg'],
    DOCUMENT_TYPES: ['application/pdf']
  },

  // Pagination
  PAGINATION: {
    DEFAULT_PAGE_SIZE: 20,
    PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
    MAX_PAGE_SIZE: 100
  },

  // Search
  SEARCH: {
    MIN_QUERY_LENGTH: 2,
    DEBOUNCE_DELAY: 300, // ms
    MAX_SUGGESTIONS: 10,
    RECENT_SEARCHES_LIMIT: 5
  },

  // Notifications
  NOTIFICATIONS: {
    TOAST_DURATION: 3000, // ms
    POSITION: 'top-right',
    MAX_TOASTS: 3
  },

  // Cache
  CACHE: {
    DEFAULT_TTL: 5 * 60 * 1000, // 5 minutes
    MAX_SIZE: 100, // Maximum number of cached items
    STORAGE_KEY_PREFIX: 'pharma_cache_'
  },

  // Routes
  ROUTES: {
    LOGIN: '/login',
    DASHBOARD: '/dashboard',
    INVOICE: {
      CREATE: '/invoice/create',
      LIST: '/invoices',
      VIEW: '/invoice/:id'
    },
    PURCHASE: {
      CREATE: '/purchase/create',
      LIST: '/purchases',
      VIEW: '/purchase/:id'
    },
    INVENTORY: {
      PRODUCTS: '/inventory/products',
      BATCHES: '/inventory/batches',
      STOCK: '/inventory/stock'
    },
    CUSTOMERS: '/customers',
    SUPPLIERS: '/suppliers',
    REPORTS: '/reports',
    SETTINGS: '/settings'
  },

  // Theme
  THEME: {
    PRIMARY_COLOR: '#3B82F6', // Blue-500
    SECONDARY_COLOR: '#10B981', // Emerald-500
    DANGER_COLOR: '#EF4444', // Red-500
    WARNING_COLOR: '#F59E0B', // Amber-500
    SUCCESS_COLOR: '#10B981', // Emerald-500
    INFO_COLOR: '#3B82F6', // Blue-500
    DARK_MODE_KEY: 'darkMode'
  },

  // Features Flags
  FEATURES: {
    ENABLE_BARCODE_SCANNER: false,
    ENABLE_VOICE_SEARCH: false,
    ENABLE_MULTI_LANGUAGE: false,
    ENABLE_OFFLINE_MODE: false,
    ENABLE_ADVANCED_ANALYTICS: true,
    ENABLE_WHATSAPP_INTEGRATION: true,
    ENABLE_EMAIL_INTEGRATION: true
  },

  // Business Rules
  BUSINESS: {
    MIN_ORDER_AMOUNT: 0,
    MAX_CREDIT_DAYS: 90,
    DEFAULT_CREDIT_DAYS: 30,
    FISCAL_YEAR_START: '04-01', // April 1st
    WORKING_HOURS: {
      START: '09:00',
      END: '21:00'
    }
  },

  // Security
  SECURITY: {
    PASSWORD_MIN_LENGTH: 8,
    PASSWORD_REQUIRE_UPPERCASE: true,
    PASSWORD_REQUIRE_LOWERCASE: true,
    PASSWORD_REQUIRE_NUMBER: true,
    PASSWORD_REQUIRE_SPECIAL: true,
    SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION: 15 * 60 * 1000 // 15 minutes
  }
};

// Helper functions
export const getApiUrl = (endpoint) => {
  return `${APP_CONFIG.API.BASE_URL}/api/${APP_CONFIG.API.VERSION}${endpoint}`;
};

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat(APP_CONFIG.LOCALE.DEFAULT, {
    style: 'currency',
    currency: APP_CONFIG.LOCALE.CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

export const getAuthToken = () => {
  return localStorage.getItem(APP_CONFIG.AUTH.TOKEN_KEY);
};

export const setAuthToken = (token) => {
  localStorage.setItem(APP_CONFIG.AUTH.TOKEN_KEY, token);
};

export const removeAuthToken = () => {
  localStorage.removeItem(APP_CONFIG.AUTH.TOKEN_KEY);
};

export const isFeatureEnabled = (feature) => {
  return APP_CONFIG.FEATURES[feature] || false;
};

export default APP_CONFIG;