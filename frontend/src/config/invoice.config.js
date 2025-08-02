/**
 * Invoice Configuration
 * Centralized configuration for all invoice-related constants
 */

export const INVOICE_CONFIG = {
  // GST Configuration
  GST: {
    DEFAULT_RATE: 12, // Default GST percentage
    RATES: [0, 5, 12, 18, 28], // Available GST rates
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
  ],

  // Delivery Types
  DELIVERY_TYPES: [
    { value: 'PICKUP', label: 'Pickup', icon: 'Package' },
    { value: 'DELIVERY', label: 'Delivery', icon: 'Truck' }
  ],

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
  ],

  // Search Configuration
  SEARCH: {
    DEBOUNCE_DELAY: {
      PRODUCT: 100, // ms
      CUSTOMER: 150, // ms
      GENERAL: 300 // ms
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
      CRITICAL: 90, // days - Red alert
      WARNING: 180, // days - Amber alert
      GOOD: 181 // days - Green status
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
    ANIMATION_DURATION: 300, // ms
    TOAST_DURATION: 3000, // ms
    MODAL_MAX_WIDTH: '3xl',
    TABLE_PAGE_SIZE: 20,
    AUTOCOMPLETE_DELAY: 100 // ms
  },

  // API Configuration
  API: {
    TIMEOUT: 30000, // 30 seconds
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000 // ms
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
      INVOICE_CREATED: 'Invoice created successfully!',
      INVOICE_UPDATED: 'Invoice updated successfully!',
      ITEM_ADDED: 'Item added to invoice',
      CUSTOMER_SELECTED: 'Customer selected'
    },
    ERROR: {
      INVOICE_FAILED: 'Failed to create invoice. Please try again.',
      NO_ITEMS: 'Please add at least one item to the invoice',
      NO_CUSTOMER: 'Please select a customer',
      INVALID_QUANTITY: 'Please enter a valid quantity',
      BATCH_NOT_FOUND: 'No batches available for this product'
    },
    INFO: {
      LOADING: 'Loading...',
      SEARCHING: 'Searching...',
      NO_RESULTS: 'No results found'
    }
  }
};

// Helper function to get stock level info
export const getStockLevelInfo = (quantity) => {
  const levels = INVOICE_CONFIG.STOCK_LEVELS;
  
  if (quantity >= levels.HIGH.min) return levels.HIGH;
  if (quantity >= levels.MEDIUM.min) return levels.MEDIUM;
  if (quantity >= levels.LOW.min) return levels.LOW;
  return levels.CRITICAL;
};

// Helper function to get expiry status
export const getExpiryStatusConfig = (daysToExpiry) => {
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

export default INVOICE_CONFIG;