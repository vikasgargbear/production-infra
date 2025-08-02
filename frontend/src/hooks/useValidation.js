/**
 * Validation Hook
 * Provides server-side validation capabilities for forms and data
 * Integrates with ValidationApiService
 */

import { useMutation, useQuery } from 'react-query';
import { useState, useCallback } from 'react';
import ValidationApiService from '../services/validationApiService';

/**
 * Hook for invoice validation
 * @param {Object} options - Hook options
 * @returns {Object} Validation methods and state
 */
export const useInvoiceValidation = (options = {}) => {
  const { onSuccess, onError } = options;

  const [validationErrors, setValidationErrors] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);

  // Invoice validation mutation
  const validateMutation = useMutation(
    (invoiceData) => ValidationApiService.validateInvoice(invoiceData),
    {
      onSuccess: (data) => {
        if (data.success) {
          setValidationErrors(data.data?.errors || []);
          setValidationWarnings(data.data?.warnings || []);
          onSuccess?.(data.data);
        } else {
          setValidationErrors([data.error]);
          onError?.(data.error);
        }
      },
      onError: (error) => {
        console.error('Validation failed:', error);
        setValidationErrors([{
          code: 'VALIDATION_ERROR',
          message: 'Validation service unavailable'
        }]);
        onError?.(error);
      }
    }
  );

  // Comprehensive validation mutation
  const comprehensiveValidateMutation = useMutation(
    (invoiceData) => ValidationApiService.comprehensiveInvoiceValidation(invoiceData),
    {
      onSuccess: (data) => {
        if (data.success) {
          setValidationErrors(data.data?.errors || []);
          setValidationWarnings(data.data?.warnings || []);
          onSuccess?.(data.data);
        } else {
          setValidationErrors([data.error]);
          onError?.(data.error);
        }
      },
      onError: (error) => {
        console.error('Comprehensive validation failed:', error);
        setValidationErrors([{
          code: 'VALIDATION_ERROR',
          message: 'Validation service unavailable'
        }]);
        onError?.(error);
      }
    }
  );

  // Clear validation results
  const clearValidation = useCallback(() => {
    setValidationErrors([]);
    setValidationWarnings([]);
    validateMutation.reset();
    comprehensiveValidateMutation.reset();
  }, [validateMutation, comprehensiveValidateMutation]);

  return {
    // Validation functions
    validate: validateMutation.mutate,
    validateComprehensive: comprehensiveValidateMutation.mutate,
    clearValidation,

    // Validation state
    isValidating: validateMutation.isLoading || comprehensiveValidateMutation.isLoading,
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
    validationData: validateMutation.data?.data || comprehensiveValidateMutation.data?.data,
    
    // Status flags
    validationSuccess: validateMutation.isSuccess || comprehensiveValidateMutation.isSuccess,
    validationError: validateMutation.error || comprehensiveValidateMutation.error
  };
};

/**
 * Hook for customer validation
 * @param {Object} options - Hook options
 * @returns {Object} Customer validation methods and state
 */
export const useCustomerValidation = (options = {}) => {
  const { onSuccess, onError } = options;

  const validateMutation = useMutation(
    (customerData) => ValidationApiService.validateCustomer(customerData),
    {
      onSuccess: (data) => {
        if (data.success) {
          onSuccess?.(data.data);
        } else {
          onError?.(data.error);
        }
      },
      onError: (error) => {
        console.error('Customer validation failed:', error);
        onError?.(error);
      }
    }
  );

  return {
    validateCustomer: validateMutation.mutate,
    isValidating: validateMutation.isLoading,
    validationData: validateMutation.data?.data,
    validationError: validateMutation.error,
    isValid: validateMutation.isSuccess && validateMutation.data?.success,
    reset: validateMutation.reset
  };
};

/**
 * Hook for product validation
 * @param {Object} options - Hook options
 * @returns {Object} Product validation methods and state
 */
export const useProductValidation = (options = {}) => {
  const { onSuccess, onError } = options;

  const validateMutation = useMutation(
    (productData) => ValidationApiService.validateProduct(productData),
    {
      onSuccess: (data) => {
        if (data.success) {
          onSuccess?.(data.data);
        } else {
          onError?.(data.error);
        }
      },
      onError: (error) => {
        console.error('Product validation failed:', error);
        onError?.(error);
      }
    }
  );

  return {
    validateProduct: validateMutation.mutate,
    isValidating: validateMutation.isLoading,
    validationData: validateMutation.data?.data,
    validationError: validateMutation.error,
    isValid: validateMutation.isSuccess && validateMutation.data?.success,
    reset: validateMutation.reset
  };
};

/**
 * Hook for stock validation
 * @param {Object} options - Hook options
 * @returns {Object} Stock validation methods and state
 */
export const useStockValidation = (options = {}) => {
  const { onSuccess, onError } = options;

  const validateMutation = useMutation(
    (items) => ValidationApiService.validateStockAvailability(items),
    {
      onSuccess: (data) => {
        if (data.success) {
          onSuccess?.(data.data);
        } else {
          onError?.(data.error);
        }
      },
      onError: (error) => {
        console.error('Stock validation failed:', error);
        onError?.(error);
      }
    }
  );

  return {
    validateStock: validateMutation.mutate,
    isValidating: validateMutation.isLoading,
    stockData: validateMutation.data?.data,
    stockErrors: validateMutation.data?.data?.errors || [],
    hasStockIssues: validateMutation.data?.data?.errors?.length > 0,
    reset: validateMutation.reset
  };
};

/**
 * Hook for credit validation
 * @param {Object} options - Hook options
 * @returns {Object} Credit validation methods and state
 */
export const useCreditValidation = (options = {}) => {
  const { onSuccess, onError } = options;

  const validateMutation = useMutation(
    ({ customerId, amount }) => ValidationApiService.validateCustomerCredit(customerId, amount),
    {
      onSuccess: (data) => {
        if (data.success) {
          onSuccess?.(data.data);
        } else {
          onError?.(data.error);
        }
      },
      onError: (error) => {
        console.error('Credit validation failed:', error);
        onError?.(error);
      }
    }
  );

  return {
    validateCredit: validateMutation.mutate,
    isValidating: validateMutation.isLoading,
    creditData: validateMutation.data?.data,
    creditAvailable: validateMutation.data?.data?.credit_available,
    creditWarnings: validateMutation.data?.data?.warnings || [],
    hasCreditIssues: !validateMutation.data?.data?.credit_available,
    reset: validateMutation.reset
  };
};

/**
 * Hook for validation rules
 * @param {String} entityType - Entity type to get rules for
 * @returns {Object} Validation rules and state
 */
export const useValidationRules = (entityType) => {
  const {
    data: rulesData,
    isLoading,
    error,
    refetch
  } = useQuery(
    ['validation-rules', entityType],
    () => ValidationApiService.getValidationRules(entityType),
    {
      enabled: !!entityType,
      staleTime: 10 * 60 * 1000, // 10 minutes
      cacheTime: 30 * 60 * 1000  // 30 minutes
    }
  );

  return {
    rules: rulesData?.data || {},
    isLoading,
    error,
    refetch,
    hasRules: !!rulesData?.data
  };
};

/**
 * Hook for real-time validation (with debounce)
 * @param {Object} options - Hook options
 * @returns {Object} Real-time validation methods and state
 */
export const useRealTimeValidation = (options = {}) => {
  const {
    validationType = 'invoice',
    debounceMs = 1000,
    onSuccess,
    onError
  } = options;

  const [validationQueue, setValidationQueue] = useState([]);
  const [lastValidation, setLastValidation] = useState(null);

  // Choose validation service based on type
  const getValidationService = useCallback((type, data) => {
    switch (type) {
      case 'invoice':
        return ValidationApiService.validateInvoice(data);
      case 'customer':
        return ValidationApiService.validateCustomer(data);
      case 'product':
        return ValidationApiService.validateProduct(data);
      case 'stock':
        return ValidationApiService.validateStockAvailability(data);
      default:
        return Promise.reject(new Error('Unknown validation type'));
    }
  }, []);

  const validateMutation = useMutation(
    ({ type, data }) => getValidationService(type, data),
    {
      onSuccess: (data) => {
        setLastValidation({
          timestamp: Date.now(),
          result: data,
          success: data.success
        });
        onSuccess?.(data);
      },
      onError: (error) => {
        setLastValidation({
          timestamp: Date.now(),
          result: null,
          success: false,
          error
        });
        onError?.(error);
      }
    }
  );

  // Debounced validation trigger
  const triggerValidation = useCallback((type, data) => {
    const validationId = Date.now();
    
    setValidationQueue(prev => [...prev, { id: validationId, type, data }]);
    
    setTimeout(() => {
      setValidationQueue(prev => {
        const item = prev.find(v => v.id === validationId);
        if (item && prev[prev.length - 1].id === validationId) {
          // Only validate if this is still the latest item
          validateMutation.mutate({ type: item.type, data: item.data });
        }
        return prev.filter(v => v.id !== validationId);
      });
    }, debounceMs);
  }, [debounceMs, validateMutation]);

  return {
    validate: triggerValidation,
    isValidating: validateMutation.isLoading,
    lastValidation,
    isValid: lastValidation?.success === true,
    hasErrors: lastValidation?.success === false,
    reset: () => {
      setLastValidation(null);
      setValidationQueue([]);
      validateMutation.reset();
    }
  };
};

/**
 * Hook for form validation with field-level validation
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