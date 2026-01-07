import { useState } from 'react';
import { PURCHASE_CONFIG } from '../config/purchase.config';

/**
 * Purchase form validation utilities
 */

interface ErrorMap {
    [key: string]: string[];
}

interface FormattedErrors {
    [key: string]: string;
}

// Validation result type
export class ValidationResult {
    isValid: boolean;
    errors: ErrorMap;

    constructor(isValid: boolean = true, errors: ErrorMap = {}) {
        this.isValid = isValid;
        this.errors = errors;
    }

    addError(field: string, message: string) {
        this.isValid = false;
        if (!this.errors[field]) {
            this.errors[field] = [];
        }
        this.errors[field].push(message);
    }

    getFieldError(field: string): string | null {
        return this.errors[field] ? this.errors[field][0] : null;
    }

    getAllErrors(): FormattedErrors {
        return Object.entries(this.errors).reduce((acc: FormattedErrors, [field, messages]) => {
            acc[field] = messages.join(', ');
            return acc;
        }, {});
    }
}

// Invoice Number Validation
export const validateInvoiceNumber = (value: string | null | undefined): ValidationResult => {
    const result = new ValidationResult();
    const config = PURCHASE_CONFIG.VALIDATION.INVOICE_NUMBER;

    if (!value || value.trim() === '') {
        if (config.required) {
            result.addError('invoiceNumber', 'Invoice number is required');
        }
        return result;
    }

    const trimmedValue = value.trim();

    if (config.minLength !== undefined && trimmedValue.length < config.minLength) {
        result.addError('invoiceNumber', `Invoice number must be at least ${config.minLength} characters`);
    }

    if (config.maxLength !== undefined && trimmedValue.length > config.maxLength) {
        result.addError('invoiceNumber', `Invoice number must not exceed ${config.maxLength} characters`);
    }

    if (config.pattern && !config.pattern.test(trimmedValue)) {
        result.addError('invoiceNumber', config.message || 'Invalid format');
    }

    return result;
};

// Supplier Validation
export const validateSupplier = (supplier: any): ValidationResult => {
    const result = new ValidationResult();
    const config = PURCHASE_CONFIG.VALIDATION.SUPPLIER;

    if (!supplier && config.required) {
        result.addError('supplier', config.message);
    }

    return result;
};

// Item Interface
interface PurchaseItem {
    product_id?: string;
    quantity?: number;
    unit_price?: number;
    batch_number?: string;
    expiry_date?: string;
    mrp?: number;
}

// Individual Item Validation
export const validateItem = (item: PurchaseItem): ValidationResult => {
    const result = new ValidationResult();

    // Product validation
    if (!item.product_id) {
        result.addError('product', 'Product is required');
    }

    // Quantity validation
    const quantityConfig = PURCHASE_CONFIG.VALIDATION.QUANTITY;
    if (!item.quantity || item.quantity <= 0) {
        result.addError('quantity', 'Quantity is required and must be greater than 0');
    } else if (
        quantityConfig?.min !== undefined &&
        quantityConfig?.max !== undefined &&
        (item.quantity < quantityConfig.min || item.quantity > quantityConfig.max)
    ) {
        result.addError('quantity', quantityConfig.message || 'Invalid quantity');
    }

    // Price validation
    const priceConfig = PURCHASE_CONFIG.VALIDATION.PRICE;
    if (!item.unit_price || item.unit_price <= 0) {
        result.addError('unit_price', 'Purchase price is required and must be greater than 0');
    } else if (
        priceConfig?.min !== undefined &&
        priceConfig?.max !== undefined &&
        (item.unit_price < priceConfig.min || item.unit_price > priceConfig.max)
    ) {
        result.addError('unit_price', priceConfig.message || 'Invalid price');
    }

    // Batch number validation (if provided)
    if (item.batch_number) {
        const batchConfig = PURCHASE_CONFIG.VALIDATION.BATCH_NUMBER;
        const trimmedBatch = item.batch_number.trim();

        if (
            batchConfig?.minLength !== undefined &&
            batchConfig?.maxLength !== undefined &&
            (trimmedBatch.length < batchConfig.minLength || trimmedBatch.length > batchConfig.maxLength)
        ) {
            result.addError('batch_number', `Batch number must be between ${batchConfig.minLength} and ${batchConfig.maxLength} characters`);
        }

        if (batchConfig?.pattern && !batchConfig.pattern.test(trimmedBatch)) {
            result.addError('batch_number', batchConfig.message || 'Invalid batch format');
        }
    }

    // Expiry date validation
    if (item.expiry_date) {
        const expiryDate = new Date(item.expiry_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (expiryDate <= today) {
            result.addError('expiry_date', 'Expiry date must be in the future');
        }
    }

    // MRP validation (if provided)
    if (item.mrp !== undefined && item.mrp !== null) {
        const mrp = parseFloat(String(item.mrp));
        const purchasePrice = parseFloat(String(item.unit_price));
        if (mrp < purchasePrice) {
            result.addError('mrp', 'MRP should be greater than or equal to purchase price');
        }
        if (mrp <= 0) {
            result.addError('mrp', 'MRP must be greater than 0');
        }
    }

    return result;
};

// Items Validation
export const validateItems = (items: PurchaseItem[]): ValidationResult => {
    const result = new ValidationResult();
    const config = PURCHASE_CONFIG.VALIDATION.ITEMS;

    if (!items || items.length < config.minItems) {
        result.addError('items', config.message);
        return result;
    }

    items.forEach((item, index) => {
        // Validate each item
        const itemResult = validateItem(item);
        if (!itemResult.isValid) {
            Object.entries(itemResult.errors).forEach(([field, messages]) => {
                messages.forEach(message => {
                    result.addError(`items[${index}].${field}`, message);
                });
            });
        }
    });

    return result;
};

interface PurchaseFormData {
    invoiceNumber?: string;
    selectedSupplier?: any;
    invoiceDate?: string;
    items?: PurchaseItem[];
    paymentMode?: string;
    subtotal?: number;
}

// Complete Purchase Form Validation
export const validatePurchaseForm = (formData: PurchaseFormData): ValidationResult => {
    const result = new ValidationResult();

    // Validate invoice number
    const invoiceResult = validateInvoiceNumber(formData.invoiceNumber);
    if (!invoiceResult.isValid) {
        Object.assign(result.errors, invoiceResult.errors);
        result.isValid = false;
    }

    // Validate supplier
    const supplierResult = validateSupplier(formData.selectedSupplier);
    if (!supplierResult.isValid) {
        Object.assign(result.errors, supplierResult.errors);
        result.isValid = false;
    }

    // Validate invoice date
    if (!formData.invoiceDate) {
        result.addError('invoiceDate', 'Invoice date is required');
    } else {
        const invoiceDate = new Date(formData.invoiceDate);
        const today = new Date();
        const maxPastDays = 365; // Allow invoices up to 1 year old
        const maxPastDate = new Date();
        maxPastDate.setDate(today.getDate() - maxPastDays);

        if (invoiceDate > today) {
            result.addError('invoiceDate', 'Invoice date cannot be in the future');
        } else if (invoiceDate < maxPastDate) {
            result.addError('invoiceDate', `Invoice date cannot be more than ${maxPastDays} days in the past`);
        }
    }

    // Validate items
    const itemsResult = validateItems(formData.items || []);
    if (!itemsResult.isValid) {
        Object.assign(result.errors, itemsResult.errors);
        result.isValid = false;
    }

    // Validate payment mode
    if (!formData.paymentMode) {
        result.addError('paymentMode', 'Payment mode is required');
    }

    // Validate totals (ensure calculations are correct)
    if (formData.items && formData.items.length > 0) {
        const calculatedSubtotal = formData.items.reduce((sum, item) => {
            return sum + ((item.quantity || 0) * (item.unit_price || 0));
        }, 0);

        const tolerance = 0.01; // Allow small rounding differences
        if (formData.subtotal !== undefined && Math.abs(calculatedSubtotal - formData.subtotal) > tolerance) {
            result.addError('subtotal', 'Subtotal calculation mismatch');
        }
    }

    return result;
};

// Real-time field validation
export const validateField = (fieldName: string, value: any, formData: Partial<PurchaseFormData> = {}): ValidationResult => {
    switch (fieldName) {
        case 'invoiceNumber':
            return validateInvoiceNumber(value);

        case 'supplier':
            return validateSupplier(value);

        case 'invoiceDate':
            const result = new ValidationResult();
            if (!value) {
                result.addError('invoiceDate', 'Invoice date is required');
            } else {
                const invoiceDate = new Date(value);
                const today = new Date();
                if (invoiceDate > today) {
                    result.addError('invoiceDate', 'Invoice date cannot be in the future');
                }
            }
            return result;

        case 'paymentMode':
            const paymentResult = new ValidationResult();
            if (!value) {
                paymentResult.addError('paymentMode', 'Payment mode is required');
            }
            return paymentResult;

        default:
            return new ValidationResult();
    }
};

// Helper to check for duplicate invoice
export const checkDuplicateInvoice = async (invoiceNumber: string, supplierId: string, excludePurchaseId: string | null = null): Promise<boolean> => {
    try {

        // For now, return false (no duplicate)
        return false;
    } catch (error) {
        return false;
    }
};

interface UsePurchaseValidationReturn {
    errors: FormattedErrors;
    touched: { [key: string]: boolean };
    validateField: (fieldName: string, value: any, formData: any) => boolean;
    validateForm: (formData: PurchaseFormData) => ValidationResult;
    resetValidation: () => void;
    getFieldError: (fieldName: string) => string | null;
}

// Custom validation hook
export const usePurchaseValidation = (): UsePurchaseValidationReturn => {
    const [errors, setErrors] = useState<FormattedErrors>({});
    const [touched, setTouched] = useState<{ [key: string]: boolean }>({});

    const validateFieldWithTouch = (fieldName: string, value: any, formData: any): boolean => {
        const result = validateField(fieldName, value, formData);
        setErrors(prev => ({
            ...prev,
            [fieldName]: result.getFieldError(fieldName) || ''
        }));
        setTouched(prev => ({
            ...prev,
            [fieldName]: true
        }));
        return result.isValid;
    };

    const validateForm = (formData: PurchaseFormData): ValidationResult => {
        const result = validatePurchaseForm(formData);
        setErrors(result.getAllErrors());
        return result;
    };

    const resetValidation = () => {
        setErrors({});
        setTouched({});
    };

    const getFieldError = (fieldName: string): string | null => {
        return touched[fieldName] ? errors[fieldName] : null;
    };

    return {
        errors,
        touched,
        validateField: validateFieldWithTouch,
        validateForm,
        resetValidation,
        getFieldError
    };
};

export default {
    validateInvoiceNumber,
    validateSupplier,
    validateItems,
    validateItem,
    validatePurchaseForm,
    validateField,
    checkDuplicateInvoice,
    usePurchaseValidation,
    ValidationResult
};
