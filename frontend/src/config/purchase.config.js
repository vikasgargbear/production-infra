// Purchase Module Configuration
export const PURCHASE_CONFIG = {
  // Default Values
  DEFAULTS: {
    PAYMENT_MODE: 'credit',
    EXPIRY_YEARS: 2,
    BATCH_PREFIX: 'BATCH',
    TAX_RATE: 18, // Default GST rate
    DISCOUNT: 0,
  },

  // API Endpoints
  API_ENDPOINTS: {
    SUPPLIERS: '/api/v1/suppliers/',
    PRODUCTS: '/api/v1/products/',
    PURCHASES: '/api/v1/purchases/',
    PURCHASES_ENHANCED: '/api/v1/purchases-enhanced/',
    PURCHASE_UPLOAD: '/api/v1/purchase-upload/',
    PENDING_RECEIPTS: '/api/v1/purchases-enhanced/pending-receipts',
    RECEIVE_ITEMS: (purchaseId) => `/api/v1/purchases-enhanced/${purchaseId}/receive-fixed`,
  },

  // Validation Rules
  VALIDATION: {
    INVOICE_NUMBER: {
      pattern: /^[A-Za-z0-9\-\/]+$/,
      minLength: 3,
      maxLength: 50,
      required: true,
      message: 'Invoice number must contain only letters, numbers, hyphens, and slashes'
    },
    SUPPLIER: {
      required: true,
      message: 'Please select a supplier'
    },
    ITEMS: {
      minItems: 1,
      message: 'At least one item is required'
    },
    BATCH_NUMBER: {
      pattern: /^[A-Z0-9\-]+$/,
      minLength: 3,
      maxLength: 30,
      message: 'Batch number must contain only letters, numbers, and hyphens'
    },
    QUANTITY: {
      min: 0.01,
      max: 999999,
      message: 'Quantity must be between 0.01 and 999999'
    },
    PRICE: {
      min: 0.01,
      max: 9999999,
      message: 'Price must be between 0.01 and 9999999'
    }
  },

  // PDF Upload Configuration
  PDF_UPLOAD: {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_TYPES: ['application/pdf'],
    ALLOWED_EXTENSIONS: ['.pdf'],
  },

  // Search Configuration
  SEARCH: {
    DEBOUNCE_DELAY: 300, // milliseconds
    MIN_SEARCH_LENGTH: 2,
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    MAX_RESULTS: 50,
  },

  // UI Configuration
  UI: {
    DATE_FORMAT: 'YYYY-MM-DD',
    CURRENCY_SYMBOL: '₹',
    DECIMAL_PLACES: 2,
    ITEMS_PER_PAGE: 20,
  },

  // Payment Modes
  PAYMENT_MODES: [
    { value: 'cash', label: 'Cash' },
    { value: 'credit', label: 'Credit' },
    { value: 'upi', label: 'UPI' },
    { value: 'card', label: 'Card' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
  ],

  // GST Rates
  GST_RATES: [
    { value: 0, label: '0%' },
    { value: 5, label: '5%' },
    { value: 12, label: '12%' },
    { value: 18, label: '18%' },
    { value: 28, label: '28%' },
  ],

  // Messages
  MESSAGES: {
    SUCCESS: {
      PURCHASE_CREATED: 'Purchase entry created successfully!',
      PURCHASE_UPDATED: 'Purchase entry updated successfully!',
      PDF_PARSED: 'Invoice parsed successfully!',
    },
    ERROR: {
      PURCHASE_CREATE_FAILED: 'Failed to create purchase entry. Please try again.',
      PURCHASE_UPDATE_FAILED: 'Failed to update purchase entry. Please try again.',
      PDF_PARSE_FAILED: 'Failed to parse PDF. Please check the file and try again.',
      NETWORK_ERROR: 'Network error. Please check your connection and try again.',
      VALIDATION_FAILED: 'Please fix the validation errors before submitting.',
      DUPLICATE_INVOICE: 'This invoice number already exists for the selected supplier.',
    },
    CONFIRM: {
      DELETE_ITEM: 'Are you sure you want to remove this item?',
      CANCEL_PURCHASE: 'Are you sure you want to cancel? All unsaved data will be lost.',
      OVERRIDE_PDF_DATA: 'This will override the current form data. Continue?',
    }
  }
};

// Helper function to generate batch number
export const generateBatchNumber = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${PURCHASE_CONFIG.DEFAULTS.BATCH_PREFIX}${year}${month}${random}`;
};

// Helper function to calculate default expiry date (returns YYYY-MM-DD format for month input)
export const calculateDefaultExpiryDate = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + PURCHASE_CONFIG.DEFAULTS.EXPIRY_YEARS);
  // Return first day of the month in YYYY-MM-DD format
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-01`;
};

// Helper function to format currency
export const formatCurrency = (amount) => {
  return `${PURCHASE_CONFIG.UI.CURRENCY_SYMBOL}${amount.toFixed(PURCHASE_CONFIG.UI.DECIMAL_PLACES)}`;
};

// Helper function to validate file upload
export const validatePDFFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  if (file.size > PURCHASE_CONFIG.PDF_UPLOAD.MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `File size must be less than ${PURCHASE_CONFIG.PDF_UPLOAD.MAX_FILE_SIZE / (1024 * 1024)}MB` 
    };
  }

  if (!PURCHASE_CONFIG.PDF_UPLOAD.ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'Only PDF files are allowed' };
  }

  const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
  if (!PURCHASE_CONFIG.PDF_UPLOAD.ALLOWED_EXTENSIONS.includes(extension)) {
    return { valid: false, error: 'Invalid file extension' };
  }

  return { valid: true };
};

export default PURCHASE_CONFIG;