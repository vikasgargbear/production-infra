import React from 'react';
import { PURCHASE_CONFIG } from '../config/purchase.config';

/**
 * Purchase form validation utilities
 */

// Validation result type
class ValidationResult {
  constructor(isValid = true, errors = {}) {
    this.isValid = isValid;
    this.errors = errors;
  }

  addError(field, message) {
    this.isValid = false;
    if (!this.errors[field]) {
      this.errors[field] = [];
    }
    this.errors[field].push(message);
  }

  getFieldError(field) {
    return this.errors[field] ? this.errors[field][0] : null;
  }

  getAllErrors() {
    return Object.entries(this.errors).reduce((acc, [field, messages]) => {
      acc[field] = messages.join(', ');
      return acc;
    }, {});
  }
}

// Invoice Number Validation
export const validateInvoiceNumber = (value) => {
  const result = new ValidationResult();
  const config = PURCHASE_CONFIG.VALIDATION.INVOICE_NUMBER;

  if (!value || value.trim() === '') {
    if (config.required) {
      result.addError('invoiceNumber', 'Invoice number is required');
    }
    return result;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.length < config.minLength) {
    result.addError('invoiceNumber', `Invoice number must be at least ${config.minLength} characters`);
  }

  if (trimmedValue.length > config.maxLength) {
    result.addError('invoiceNumber', `Invoice number must not exceed ${config.maxLength} characters`);
  }

  if (!config.pattern.test(trimmedValue)) {
    result.addError('invoiceNumber', config.message);
  }

  return result;
};

// Supplier Validation
export const validateSupplier = (supplier) => {
  const result = new ValidationResult();
  const config = PURCHASE_CONFIG.VALIDATION.SUPPLIER;

  if (!supplier && config.required) {
    result.addError('supplier', config.message);
  }

  return result;
};

// Items Validation
export const validateItems = (items) => {
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

// Individual Item Validation
export const validateItem = (item) => {
  const result = new ValidationResult();

  // Product validation
  if (!item.product_id) {
    result.addError('product', 'Product is required');
  }

  // Quantity validation
  const quantityConfig = PURCHASE_CONFIG.VALIDATION.QUANTITY;
  if (!item.quantity || item.quantity <= 0) {
    result.addError('quantity', 'Quantity is required and must be greater than 0');
  } else if (item.quantity < quantityConfig.min || item.quantity > quantityConfig.max) {
    result.addError('quantity', quantityConfig.message);
  }

  // Price validation
  const priceConfig = PURCHASE_CONFIG.VALIDATION.PRICE;
  if (!item.purchase_price || item.purchase_price <= 0) {
    result.addError('purchase_price', 'Purchase price is required and must be greater than 0');
  } else if (item.purchase_price < priceConfig.min || item.purchase_price > priceConfig.max) {
    result.addError('purchase_price', priceConfig.message);
  }

  // Batch number validation (if provided)
  if (item.batch_number) {
    const batchConfig = PURCHASE_CONFIG.VALIDATION.BATCH_NUMBER;
    const trimmedBatch = item.batch_number.trim();
    
    if (trimmedBatch.length < batchConfig.minLength || trimmedBatch.length > batchConfig.maxLength) {
      result.addError('batch_number', `Batch number must be between ${batchConfig.minLength} and ${batchConfig.maxLength} characters`);
    }
    
    if (!batchConfig.pattern.test(trimmedBatch)) {
      result.addError('batch_number', batchConfig.message);
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
    const mrp = parseFloat(item.mrp);
    const purchasePrice = parseFloat(item.purchase_price);
    
    console.log('MRP Validation:', { 
      mrp, 
      purchasePrice, 
      'mrp < purchasePrice': mrp < purchasePrice,
      item 
    });
    
    if (mrp < purchasePrice) {
      result.addError('mrp', 'MRP should be greater than or equal to purchase price');
    }
    if (mrp <= 0) {
      result.addError('mrp', 'MRP must be greater than 0');
    }
  }

  return result;
};

// Complete Purchase Form Validation
export const validatePurchaseForm = (formData) => {
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
  const itemsResult = validateItems(formData.items);
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
      return sum + (item.quantity * item.purchase_price);
    }, 0);

    const tolerance = 0.01; // Allow small rounding differences
    if (Math.abs(calculatedSubtotal - formData.subtotal) > tolerance) {
      result.addError('subtotal', 'Subtotal calculation mismatch');
    }
  }

  return result;
};

// Real-time field validation
export const validateField = (fieldName, value, formData = {}) => {
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
export const checkDuplicateInvoice = async (invoiceNumber, supplierId, excludePurchaseId = null) => {
  try {
    // This would be an API call in real implementation
    // const response = await purchasesApi.checkDuplicate({
    //   invoice_number: invoiceNumber,
    //   supplier_id: supplierId,
    //   exclude_id: excludePurchaseId
    // });
    // return response.data.exists;
    
    // For now, return false (no duplicate)
    return false;
  } catch (error) {
    console.error('Error checking duplicate invoice:', error);
    return false;
  }
};

// Custom validation hook
export const usePurchaseValidation = () => {
  const [errors, setErrors] = React.useState({});
  const [touched, setTouched] = React.useState({});

  const validateFieldWithTouch = (fieldName, value, formData) => {
    const result = validateField(fieldName, value, formData);
    setErrors(prev => ({
      ...prev,
      [fieldName]: result.getFieldError(fieldName)
    }));
    setTouched(prev => ({
      ...prev,
      [fieldName]: true
    }));
    return result.isValid;
  };

  const validateForm = (formData) => {
    const result = validatePurchaseForm(formData);
    setErrors(result.getAllErrors());
    return result;
  };

  const resetValidation = () => {
    setErrors({});
    setTouched({});
  };

  const getFieldError = (fieldName) => {
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