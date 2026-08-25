import { getApiBaseUrl } from './apiBase';

/**
 * Global Application Configuration
 * Centralized configuration for application-wide settings
 */

export interface AppConfig {
    APP_NAME: string;
    APP_VERSION: string;
    COMPANY_NAME: string;
    API: {
        BASE_URL: string;
        VERSION: string;
        TIMEOUT: number;
        HEADERS: Record<string, string>;
    };
    LOCALE: {
        DEFAULT: string;
        CURRENCY: string;
        CURRENCY_SYMBOL: string;
        DATE_FORMAT: string;
        TIME_FORMAT: string;
        TIMEZONE: string;
    };
    UPLOAD: {
        MAX_SIZE: number;
        ALLOWED_TYPES: string[];
        IMAGE_TYPES: string[];
        DOCUMENT_TYPES: string[];
    };
    PAGINATION: {
        DEFAULT_PAGE_SIZE: number;
        PAGE_SIZE_OPTIONS: number[];
        MAX_PAGE_SIZE: number;
    };
    SEARCH: {
        MIN_QUERY_LENGTH: number;
        DEBOUNCE_DELAY: number;
        MAX_SUGGESTIONS: number;
        RECENT_SEARCHES_LIMIT: number;
    };
    NOTIFICATIONS: {
        TOAST_DURATION: number;
        POSITION: string;
        MAX_TOASTS: number;
    };
    CACHE: {
        DEFAULT_TTL: number;
        MAX_SIZE: number;
        STORAGE_KEY_PREFIX: string;
    };
    ROUTES: {
        LOGIN: string;
        DASHBOARD: string;
        INVOICE: { CREATE: string; LIST: string; VIEW: string };
        PURCHASE: { CREATE: string; LIST: string; VIEW: string };
        CUSTOMERS: string;
        SUPPLIERS: string;
        REPORTS: string;
        SETTINGS: string;
    };
    THEME: {
        PRIMARY_COLOR: string;
        SECONDARY_COLOR: string;
        DANGER_COLOR: string;
        WARNING_COLOR: string;
        SUCCESS_COLOR: string;
        INFO_COLOR: string;
        DARK_MODE_KEY: string;
    };
    FEATURES: {
        ENABLE_BARCODE_SCANNER: boolean;
        ENABLE_VOICE_SEARCH: boolean;
        ENABLE_MULTI_LANGUAGE: boolean;
        ENABLE_OFFLINE_MODE: boolean;
        ENABLE_ADVANCED_ANALYTICS: boolean;
        ENABLE_WHATSAPP_INTEGRATION: boolean;
        ENABLE_EMAIL_INTEGRATION: boolean;
    };
    BUSINESS: {
        MIN_ORDER_AMOUNT: number;
        MAX_CREDIT_DAYS: number;
        DEFAULT_CREDIT_DAYS: number;
        FISCAL_YEAR_START: string;
        WORKING_HOURS: { START: string; END: string };
    };
    SECURITY: {
        PASSWORD_MIN_LENGTH: number;
        PASSWORD_REQUIRE_UPPERCASE: boolean;
        PASSWORD_REQUIRE_LOWERCASE: boolean;
        PASSWORD_REQUIRE_NUMBER: boolean;
        PASSWORD_REQUIRE_SPECIAL: boolean;
        SESSION_TIMEOUT: number;
        MAX_LOGIN_ATTEMPTS: number;
        LOCKOUT_DURATION: number;
    };
}

export const APP_CONFIG: AppConfig = {
    APP_NAME: 'Pharma Management System',
    APP_VERSION: '1.0.0',
    COMPANY_NAME: 'Your Pharmacy Name',

    API: {
        BASE_URL: getApiBaseUrl(),
        VERSION: 'v1',
        TIMEOUT: 30000,
        HEADERS: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    },

    LOCALE: {
        DEFAULT: 'en-IN',
        CURRENCY: 'INR',
        CURRENCY_SYMBOL: '₹',
        DATE_FORMAT: 'DD-MM-YYYY',
        TIME_FORMAT: 'hh:mm A',
        TIMEZONE: 'Asia/Kolkata'
    },

    UPLOAD: {
        MAX_SIZE: 5 * 1024 * 1024,
        ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'],
        IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/jpg'],
        DOCUMENT_TYPES: ['application/pdf']
    },

    PAGINATION: {
        DEFAULT_PAGE_SIZE: 20,
        PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
        MAX_PAGE_SIZE: 100
    },

    SEARCH: {
        MIN_QUERY_LENGTH: 2,
        DEBOUNCE_DELAY: 300,
        MAX_SUGGESTIONS: 10,
        RECENT_SEARCHES_LIMIT: 5
    },

    NOTIFICATIONS: {
        TOAST_DURATION: 3000,
        POSITION: 'top-right',
        MAX_TOASTS: 3
    },

    CACHE: {
        DEFAULT_TTL: 5 * 60 * 1000,
        MAX_SIZE: 100,
        STORAGE_KEY_PREFIX: 'pharma_cache_'
    },

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
        CUSTOMERS: '/customers',
        SUPPLIERS: '/suppliers',
        REPORTS: '/reports',
        SETTINGS: '/settings'
    },

    THEME: {
        PRIMARY_COLOR: '#3B82F6',
        SECONDARY_COLOR: '#10B981',
        DANGER_COLOR: '#EF4444',
        WARNING_COLOR: '#F59E0B',
        SUCCESS_COLOR: '#10B981',
        INFO_COLOR: '#3B82F6',
        DARK_MODE_KEY: 'darkMode'
    },

    FEATURES: {
        ENABLE_BARCODE_SCANNER: false,
        ENABLE_VOICE_SEARCH: false,
        ENABLE_MULTI_LANGUAGE: false,
        ENABLE_OFFLINE_MODE: false,
        ENABLE_ADVANCED_ANALYTICS: true,
        ENABLE_WHATSAPP_INTEGRATION: true,
        ENABLE_EMAIL_INTEGRATION: true
    },

    BUSINESS: {
        MIN_ORDER_AMOUNT: 0,
        MAX_CREDIT_DAYS: 90,
        DEFAULT_CREDIT_DAYS: 30,
        FISCAL_YEAR_START: '04-01',
        WORKING_HOURS: {
            START: '09:00',
            END: '21:00'
        }
    },

    SECURITY: {
        PASSWORD_MIN_LENGTH: 8,
        PASSWORD_REQUIRE_UPPERCASE: true,
        PASSWORD_REQUIRE_LOWERCASE: true,
        PASSWORD_REQUIRE_NUMBER: true,
        PASSWORD_REQUIRE_SPECIAL: true,
        SESSION_TIMEOUT: 30 * 60 * 1000,
        MAX_LOGIN_ATTEMPTS: 5,
        LOCKOUT_DURATION: 15 * 60 * 1000
    }
};

// Helper functions
export const getApiUrl = (endpoint: string): string => {
    return `${APP_CONFIG.API.BASE_URL}/api/${APP_CONFIG.API.VERSION}${endpoint}`;
};

export const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat(APP_CONFIG.LOCALE.DEFAULT, {
        style: 'currency',
        currency: APP_CONFIG.LOCALE.CURRENCY,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
};

export const isFeatureEnabled = (feature: keyof AppConfig['FEATURES']): boolean => {
    return APP_CONFIG.FEATURES[feature] || false;
};

export default APP_CONFIG;
