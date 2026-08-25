/**
 * Purchase Module Configuration
 */

export interface ValidationRule {
    pattern?: RegExp;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    required?: boolean;
    message: string;
}

export interface PurchaseConfigType {
    VALIDATION: {
        INVOICE_NUMBER: ValidationRule;
        SUPPLIER: ValidationRule;
        ITEMS: { minItems: number; message: string };
        BATCH_NUMBER: ValidationRule;
        QUANTITY: ValidationRule;
        PRICE: ValidationRule;
    };
    PDF_UPLOAD: {
        MAX_FILE_SIZE: number;
        ALLOWED_TYPES: string[];
        ALLOWED_EXTENSIONS: string[];
    };
    UI: {
        DATE_FORMAT: string;
        CURRENCY_SYMBOL: string;
        DECIMAL_PLACES: number;
        ITEMS_PER_PAGE: number;
    };
}

export const PURCHASE_CONFIG: PurchaseConfigType = {
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

    PDF_UPLOAD: {
        MAX_FILE_SIZE: 10 * 1024 * 1024,
        ALLOWED_TYPES: ['application/pdf'],
        ALLOWED_EXTENSIONS: ['.pdf'],
    },

    UI: {
        DATE_FORMAT: 'YYYY-MM-DD',
        CURRENCY_SYMBOL: '₹',
        DECIMAL_PLACES: 2,
        ITEMS_PER_PAGE: 20,
    },

};

// Helper function to format currency
export const formatCurrency = (amount: number): string => {
    return `${PURCHASE_CONFIG.UI.CURRENCY_SYMBOL}${amount.toFixed(PURCHASE_CONFIG.UI.DECIMAL_PLACES)}`;
};

// Helper function to validate file upload
export interface ValidationResult {
    valid: boolean;
    error?: string;
}

export const validatePDFFile = (file: File | null): ValidationResult => {
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
