/**
 * Simple Validation Hook (No React Query dependency)
 * Provides server-side validation capabilities without React Query
 */

import { useState, useCallback } from 'react';
import ValidationApiService from '../services/validationApiService';

/**
 * Hook for invoice validation (simple version)
 * @param {Object} options - Hook options
 * @returns {Object} Validation methods and state
 */
export const useInvoiceValidation = (options = {}) => {
  const { onSuccess, onError } = options;

  const [validationErrors, setValidationErrors] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);
  const [isValidating, setIsValidating] = useState(false);
  const [validationData, setValidationData] = useState(null);

  // Basic validation
  const validate = useCallback(async (invoiceData) => {
    setIsValidating(true);
    setValidationErrors([]);
    setValidationWarnings([]);
    
    try {
      const result = await ValidationApiService.validateInvoice(invoiceData);
      
      if (result.success) {
        setValidationErrors(result.data?.errors || []);
        setValidationWarnings(result.data?.warnings || []);
        setValidationData(result.data);
        onSuccess?.(result.data);
      } else {
        setValidationErrors([result.error]);
        onError?.(result.error);
      }
    } catch (error) {
      console.error('Validation failed:', error);
      setValidationErrors([{
        code: 'VALIDATION_ERROR',
        message: 'Validation service unavailable'
      }]);
      onError?.(error);
    } finally {
      setIsValidating(false);
    }
  }, [onSuccess, onError]);

  // Comprehensive validation
  const validateComprehensive = useCallback(async (invoiceData) => {
    setIsValidating(true);
    setValidationErrors([]);
    setValidationWarnings([]);
    
    try {
      const result = await ValidationApiService.comprehensiveInvoiceValidation(invoiceData);
      
      if (result.success) {
        setValidationErrors(result.data?.errors || []);
        setValidationWarnings(result.data?.warnings || []);
        setValidationData(result.data);
        onSuccess?.(result.data);
      } else {
        setValidationErrors([result.error]);
        onError?.(result.error);
      }
    } catch (error) {
      console.error('Comprehensive validation failed:', error);
      setValidationErrors([{
        code: 'VALIDATION_ERROR',
        message: 'Validation service unavailable'
      }]);
      onError?.(error);
    } finally {
      setIsValidating(false);
    }
  }, [onSuccess, onError]);

  // Clear validation results
  const clearValidation = useCallback(() => {
    setValidationErrors([]);
    setValidationWarnings([]);
    setValidationData(null);
  }, []);

  return {
    // Validation functions
    validate,
    validateComprehensive,
    clearValidation,

    // Validation state
    isValidating,
    validationErrors,
    validationWarnings,
    
    // Validation results
    isValid: validationErrors.length === 0,
    hasErrors: validationErrors.length > 0,
    hasWarnings: validationWarnings.length > 0,
    
    // Formatted messages
    errorMessage: ValidationApiService.formatValidationErrors(validationErrors),
    warningMessage: ValidationApiService.formatValidationWarnings(validationWarnings),
    
    // Raw data
    validationData,
    
    // Status flags
    validationSuccess: !!validationData && validationErrors.length === 0,
    validationError: validationErrors.length > 0
  };
};

/**
 * Hook for customer validation (simple version)
 * @param {Object} options - Hook options
 * @returns {Object} Customer validation methods and state
 */
export const useCustomerValidation = (options = {}) => {
  const { onSuccess, onError } = options;
  
  const [isValidating, setIsValidating] = useState(false);
  const [validationData, setValidationData] = useState(null);
  const [validationError, setValidationError] = useState(null);

  const validateCustomer = useCallback(async (customerData) => {
    setIsValidating(true);
    setValidationError(null);
    
    try {
      const result = await ValidationApiService.validateCustomer(customerData);
      
      if (result.success) {
        setValidationData(result.data);
        onSuccess?.(result.data);
      } else {
        setValidationError(result.error);
        onError?.(result.error);
      }
    } catch (error) {
      setValidationError(error);
      onError?.(error);
    } finally {
      setIsValidating(false);
    }
  }, [onSuccess, onError]);

  const reset = useCallback(() => {
    setValidationData(null);
    setValidationError(null);
  }, []);

  return {
    validateCustomer,
    isValidating,
    validationData,
    validationError,
    isValid: !!validationData && !validationError,
    reset
  };
};

/**
 * Hook for stock validation (simple version)
 * @param {Object} options - Hook options
 * @returns {Object} Stock validation methods and state
 */
export const useStockValidation = (options = {}) => {
  const { onSuccess, onError } = options;
  
  const [isValidating, setIsValidating] = useState(false);
  const [stockData, setStockData] = useState(null);
  const [stockErrors, setStockErrors] = useState([]);

  const validateStock = useCallback(async (items) => {
    setIsValidating(true);
    setStockErrors([]);
    
    try {
      const result = await ValidationApiService.validateStockAvailability(items);
      
      if (result.success) {
        setStockData(result.data);
        setStockErrors(result.data?.errors || []);
        onSuccess?.(result.data);
      } else {
        setStockErrors([result.error]);
        onError?.(result.error);
      }
    } catch (error) {
      setStockErrors([error]);
      onError?.(error);
    } finally {
      setIsValidating(false);
    }
  }, [onSuccess, onError]);

  const reset = useCallback(() => {
    setStockData(null);
    setStockErrors([]);
  }, []);

  return {
    validateStock,
    isValidating,
    stockData,
    stockErrors,
    hasStockIssues: stockErrors.length > 0,
    reset
  };
};

/**
 * Hook for form validation (simple version)
 * @param {Object} initialData - Initial form data
 * @param {Object} validationRules - Field validation rules
 * @returns {Object} Form validation methods and state
 */
export const useFormValidation = (initialData = {}, validationRules = {}) => {
  const [formData, setFormData] = useState(initialData);
  const [fieldErrors, setFieldErrors] = useState({});
  const [touchedFields, setTouchedFields] = useState({});

  // Validate individual field
  const validateField = useCallback((fieldName, value) => {
    const rules = validationRules[fieldName];
    if (!rules) return null;

    for (const rule of rules) {
      if (rule.required && (!value || value.toString().trim() === '')) {
        return { code: 'REQUIRED', message: rule.message || `${fieldName} is required` };
      }
      
      if (rule.pattern && value && !rule.pattern.test(value)) {
        return { code: 'PATTERN', message: rule.message || `Invalid ${fieldName} format` };
      }
      
      if (rule.minLength && value && value.length < rule.minLength) {
        return { code: 'MIN_LENGTH', message: rule.message || `${fieldName} must be at least ${rule.minLength} characters` };
      }
      
      if (rule.maxLength && value && value.length > rule.maxLength) {
        return { code: 'MAX_LENGTH', message: rule.message || `${fieldName} must be no more than ${rule.maxLength} characters` };
      }
      
      if (rule.custom && !rule.custom(value, formData)) {
        return { code: 'CUSTOM', message: rule.message || `Invalid ${fieldName}` };
      }
    }

    return null;
  }, [validationRules, formData]);

  // Update field value and validate
  const updateField = useCallback((fieldName, value) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
    setTouchedFields(prev => ({ ...prev, [fieldName]: true }));
    
    const error = validateField(fieldName, value);
    setFieldErrors(prev => ({
      ...prev,
      [fieldName]: error
    }));
  }, [validateField]);

  // Validate all fields
  const validateAll = useCallback(() => {
    const errors = {};
    let isValid = true;

    Object.keys(validationRules).forEach(fieldName => {
      const error = validateField(fieldName, formData[fieldName]);
      if (error) {
        errors[fieldName] = error;
        isValid = false;
      }
    });

    setFieldErrors(errors);
    setTouchedFields(Object.keys(validationRules).reduce((acc, key) => ({ ...acc, [key]: true }), {}));
    
    return isValid;
  }, [validationRules, formData, validateField]);

  // Reset form
  const reset = useCallback(() => {
    setFormData(initialData);
    setFieldErrors({});
    setTouchedFields({});
  }, [initialData]);

  return {
    formData,
    fieldErrors,
    touchedFields,
    updateField,
    validateAll,
    reset,
    isValid: Object.keys(fieldErrors).length === 0,
    hasErrors: Object.keys(fieldErrors).length > 0,
    getFieldError: (fieldName) => fieldErrors[fieldName],
    isFieldTouched: (fieldName) => touchedFields[fieldName],
    isFieldValid: (fieldName) => !fieldErrors[fieldName] && touchedFields[fieldName]
  };
};