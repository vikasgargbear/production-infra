/**
 * Invoice Configuration
 * Centralized configuration for all invoice-related constants
 */

// ==================== TYPE DEFINITIONS ====================

interface GSTConfig {
    DEFAULT_RATE: number;
    RATES: readonly number[];
    TYPES: {
        INTRA_STATE: string;
        INTER_STATE: string;
    };
}

interface PaymentMode {
    value: string;
    label: string;
    icon: string;
}

interface DeliveryType {
    value: string;
    label: string;
    icon: string;
}

interface SearchConfig {
    DEBOUNCE_DELAY: {
        PRODUCT: number;
        CUSTOMER: number;
        GENERAL: number;
    };
    MIN_QUERY_LENGTH: number;
    MAX_RESULTS: {
        LOCAL: number;
        API: number;
    };
    CACHE_TTL: number;
}

interface BatchConfig {
    EXPIRY_THRESHOLDS: {
        CRITICAL: number;
        WARNING: number;
        GOOD: number;
    };
    DEFAULT_BATCH: {
        BATCH_NUMBER: string;
        EXPIRY_DAYS: number;
        QUANTITY: number;
    };
}

interface DefaultsConfig {
    INVOICE_PREFIX: string;
    DUE_DAYS: number;
    CURRENCY: string;
    LOCALE: string;
    DATE_FORMAT: string;
    TIME_FORMAT: string;
}

interface ValidationConfig {
    MIN_ITEMS: number;
    MAX_ITEMS: number;
    MAX_QUANTITY: number;
    MAX_DISCOUNT: number;
    MIN_AMOUNT: number;
    PHONE_REGEX: RegExp;
    EMAIL_REGEX: RegExp;
    GSTIN_REGEX: RegExp;
    HSN_REGEX: RegExp;
}

interface UIConfig {
    ANIMATION_DURATION: number;
    TOAST_DURATION: number;
    MODAL_MAX_WIDTH: string;
    TABLE_PAGE_SIZE: number;
    AUTOCOMPLETE_DELAY: number;
}

interface APIConfig {
    TIMEOUT: number;
    RETRY_ATTEMPTS: number;
    RETRY_DELAY: number;
}

interface StockLevel {
    min?: number;
    max?: number;
    color: string;
    label: string;
}

interface StockLevelsConfig {
    HIGH: StockLevel;
    MEDIUM: StockLevel;
    LOW: StockLevel;
    CRITICAL: StockLevel;
}

interface MessagesConfig {
    SUCCESS: Record<string, string>;
    ERROR: Record<string, string>;
    INFO: Record<string, string>;
}

interface InvoiceConfigType {
    GST: GSTConfig;
    PAYMENT_MODES: readonly PaymentMode[];
    DELIVERY_TYPES: readonly DeliveryType[];
    TRANSPORT_COMPANIES: readonly string[];
    SEARCH: SearchConfig;
    BATCH: BatchConfig;
    DEFAULTS: DefaultsConfig;
    VALIDATION: ValidationConfig;
    UI: UIConfig;
    API: APIConfig;
    STOCK_LEVELS: StockLevelsConfig;
    MESSAGES: MessagesConfig;
}

// ==================== CONFIGURATION ====================

export const INVOICE_CONFIG: InvoiceConfigType = {
    // GST Configuration
    GST: {
        DEFAULT_RATE: 12,
        RATES: [0, 5, 12, 18, 28] as const,
        TYPES: {
            INTRA_STATE: 'CGST/SGST',
            INTER_STATE: 'IGST'
        }
    },

    // Payment Modes
    PAYMENT_MODES: [
        { value: 'CASH', label: 'Cash', icon: 'Banknote' },
        { value: 'CREDIT', label: 'Credit', icon: 'CreditCard' },
        { value: 'UPI', label: 'UPI', icon: 'Smartphone' },
        { value: 'CARD', label: 'Card', icon: 'CreditCard' },
        { value: 'BANK_TRANSFER', label: 'Bank Transfer', icon: 'Building' }
    ] as const,

    // Delivery Types
    DELIVERY_TYPES: [
        { value: 'PICKUP', label: 'Pickup', icon: 'Package' },
        { value: 'DELIVERY', label: 'Delivery', icon: 'Truck' }
    ] as const,

    // Transport Companies
    TRANSPORT_COMPANIES: [
        'DTDC',
        'Blue Dart',
        'Delhivery',
        'FedEx',
        'Professional',
        'Maruti',
        'V-Trans',
        'Gati',
        'Other'
    ] as const,

    // Search Configuration
    SEARCH: {
        DEBOUNCE_DELAY: {
            PRODUCT: 100,
            CUSTOMER: 150,
            GENERAL: 300
        },
        MIN_QUERY_LENGTH: 2,
        MAX_RESULTS: {
            LOCAL: 50,
            API: 20
        },
        CACHE_TTL: 5 * 60 * 1000 // 5 minutes
    },

    // Batch Configuration
    BATCH: {
        EXPIRY_THRESHOLDS: {
            CRITICAL: 90,
            WARNING: 180,
            GOOD: 181
        },
        DEFAULT_BATCH: {
            BATCH_NUMBER: 'DEFAULT',
            EXPIRY_DAYS: 365,
            QUANTITY: 100
        }
    },

    // Invoice Defaults
    DEFAULTS: {
        INVOICE_PREFIX: 'INV-',
        DUE_DAYS: 30,
        CURRENCY: 'INR',
        LOCALE: 'en-IN',
        DATE_FORMAT: 'DD-MM-YYYY',
        TIME_FORMAT: '12h'
    },

    // Validation Rules
    VALIDATION: {
        MIN_ITEMS: 1,
        MAX_ITEMS: 100,
        MAX_QUANTITY: 9999,
        MAX_DISCOUNT: 100,
        MIN_AMOUNT: 0,
        PHONE_REGEX: /^\d{10}$/,
        EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        GSTIN_REGEX: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
        HSN_REGEX: /^\d{4,8}$/
    },

    // UI Configuration
    UI: {
        ANIMATION_DURATION: 300,
        TOAST_DURATION: 3000,
        MODAL_MAX_WIDTH: '3xl',
        TABLE_PAGE_SIZE: 20,
        AUTOCOMPLETE_DELAY: 100
    },

    // API Configuration
    API: {
        TIMEOUT: 30000,
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY: 1000
    },

    // Stock Level Indicators
    STOCK_LEVELS: {
        HIGH: { min: 100, color: 'emerald', label: 'High Stock' },
        MEDIUM: { min: 50, max: 99, color: 'amber', label: 'Medium Stock' },
        LOW: { min: 10, max: 49, color: 'orange', label: 'Low Stock' },
        CRITICAL: { max: 9, color: 'red', label: 'Critical Stock' }
    },

    // Status Messages
    MESSAGES: {
        SUCCESS: {
            INVOICE_CREATED: 'Invoice has been created',
            INVOICE_UPDATED: 'Invoice has been updated',
            ITEM_ADDED: 'Item added to invoice',
            CUSTOMER_SELECTED: 'Customer selected',
            PRODUCT_CREATED: 'Product has been created',
            CUSTOMER_CREATED: 'Customer has been created',
            PAYMENT_RECORDED: 'Payment has been recorded',
            CHALLAN_CREATED: 'Delivery challan has been created',
            ORDER_CREATED: 'Order has been created',
            STOCK_UPDATED: 'Stock has been updated',
            SETTINGS_SAVED: 'Settings have been saved'
        },
        ERROR: {
            INVOICE_FAILED: 'Unable to create invoice. Please check your data and try again.',
            NO_ITEMS: 'Please add at least one item to continue',
            NO_CUSTOMER: 'Please select a customer to continue',
            INVALID_QUANTITY: 'Please enter a valid quantity',
            BATCH_NOT_FOUND: 'No batches available for this product',
            NETWORK_ERROR: 'Network error. Please check your connection and try again.',
            VALIDATION_ERROR: 'Please check your data and try again.',
            SERVER_ERROR: 'Server error. Please try again in a moment.'
        },
        INFO: {
            LOADING: 'Loading...',
            SEARCHING: 'Searching...',
            NO_RESULTS: 'No results found',
            UPLOADING: 'Uploading...',
            PROCESSING: 'Processing...'
        }
    }
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Get stock level info based on quantity
 */
export const getStockLevelInfo = (quantity: number): StockLevel => {
    const levels = INVOICE_CONFIG.STOCK_LEVELS;

    if (quantity >= (levels.HIGH.min ?? 0)) return levels.HIGH;
    if (quantity >= (levels.MEDIUM.min ?? 0)) return levels.MEDIUM;
    if (quantity >= (levels.LOW.min ?? 0)) return levels.LOW;
    return levels.CRITICAL;
};

/**
 * Get expiry status configuration based on days to expiry
 */
export interface ExpiryStatus {
    status: 'expired' | 'critical' | 'warning' | 'good';
    color: string;
    label: string;
}

export const getExpiryStatusConfig = (daysToExpiry: number): ExpiryStatus => {
    const thresholds = INVOICE_CONFIG.BATCH.EXPIRY_THRESHOLDS;

    if (daysToExpiry <= 0) {
        return { status: 'expired', color: 'red', label: 'Expired' };
    }
    if (daysToExpiry <= thresholds.CRITICAL) {
        return { status: 'critical', color: 'red', label: 'Expiring Soon' };
    }
    if (daysToExpiry <= thresholds.WARNING) {
        return { status: 'warning', color: 'amber', label: 'Near Expiry' };
    }
    return { status: 'good', color: 'emerald', label: 'Fresh Stock' };
};

// ==================== EXPORTS ====================

export default INVOICE_CONFIG;

// Re-export types for external use
export type {
    InvoiceConfigType,
    PaymentMode,
    DeliveryType,
    StockLevel,
    GSTConfig,
    SearchConfig,
    BatchConfig,
    ValidationConfig
};
