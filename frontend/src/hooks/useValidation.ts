/**
 * Validation Hook - TypeScript Version
 * Provides server-side validation capabilities for forms and data
 */

import { useMutation, useQuery } from 'react-query';
import { useState, useCallback } from 'react';
import ValidationApiService from '../services/validationApiService';

// Types
interface ValidationError {
    code: string;
    message: string;
    field?: string;
}

interface ValidationWarning {
    code: string;
    message: string;
    field?: string;
}

interface ValidationResult {
    success: boolean;
    data?: {
        errors?: ValidationError[];
        warnings?: ValidationWarning[];
        [key: string]: unknown;
    };
    error?: string;
}

interface ValidationOptions {
    onSuccess?: (data: ValidationResult['data']) => void;
    onError?: (error: unknown) => void;
}

// Invoice Validation Hook
export const useInvoiceValidation = (options: ValidationOptions = {}) => {
    const { onSuccess, onError } = options;
    const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
    const [validationWarnings, setValidationWarnings] = useState<ValidationWarning[]>([]);

    const validateMutation = useMutation(
        (invoiceData: unknown) => ValidationApiService.validateInvoice(invoiceData),
        {
            onSuccess: (data: ValidationResult) => {
                if (data.success) {
                    setValidationErrors(data.data?.errors || []);
                    setValidationWarnings(data.data?.warnings || []);
                    onSuccess?.(data.data);
                } else {
                    setValidationErrors([{ code: 'ERROR', message: data.error || 'Validation failed' }]);
                    onError?.(data.error);
                }
            },
            onError: (error: unknown) => {
                setValidationErrors([{ code: 'VALIDATION_ERROR', message: 'Validation service unavailable' }]);
                onError?.(error);
            }
        }
    );

    const comprehensiveValidateMutation = useMutation(
        (invoiceData: unknown) => ValidationApiService.comprehensiveInvoiceValidation(invoiceData),
        {
            onSuccess: (data: ValidationResult) => {
                if (data.success) {
                    setValidationErrors(data.data?.errors || []);
                    setValidationWarnings(data.data?.warnings || []);
                    onSuccess?.(data.data);
                } else {
                    setValidationErrors([{ code: 'ERROR', message: data.error || 'Validation failed' }]);
                    onError?.(data.error);
                }
            },
            onError: (error: unknown) => {
                setValidationErrors([{ code: 'VALIDATION_ERROR', message: 'Validation service unavailable' }]);
                onError?.(error);
            }
        }
    );

    const clearValidation = useCallback(() => {
        setValidationErrors([]);
        setValidationWarnings([]);
        validateMutation.reset();
        comprehensiveValidateMutation.reset();
    }, [validateMutation, comprehensiveValidateMutation]);

    return {
        validate: validateMutation.mutate,
        validateComprehensive: comprehensiveValidateMutation.mutate,
        clearValidation,
        isValidating: validateMutation.isLoading || comprehensiveValidateMutation.isLoading,
        validationErrors,
        validationWarnings,
        isValid: validationErrors.length === 0,
        hasErrors: validationErrors.length > 0,
        hasWarnings: validationWarnings.length > 0,
        errorMessage: ValidationApiService.formatValidationErrors(validationErrors),
        warningMessage: ValidationApiService.formatValidationWarnings(validationWarnings),
        validationData: validateMutation.data?.data || comprehensiveValidateMutation.data?.data,
        validationSuccess: validateMutation.isSuccess || comprehensiveValidateMutation.isSuccess,
        validationError: validateMutation.error || comprehensiveValidateMutation.error
    };
};

// Customer Validation Hook
export const useCustomerValidation = (options: ValidationOptions = {}) => {
    const { onSuccess, onError } = options;

    const validateMutation = useMutation(
        (customerData: unknown) => ValidationApiService.validateCustomer(customerData),
        {
            onSuccess: (data: ValidationResult) => {
                if (data.success) {
                    onSuccess?.(data.data);
                } else {
                    onError?.(data.error);
                }
            },
            onError: (error: unknown) => {
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

// Product Validation Hook
export const useProductValidation = (options: ValidationOptions = {}) => {
    const { onSuccess, onError } = options;

    const validateMutation = useMutation(
        (productData: unknown) => ValidationApiService.validateProduct(productData),
        {
            onSuccess: (data: ValidationResult) => {
                if (data.success) {
                    onSuccess?.(data.data);
                } else {
                    onError?.(data.error);
                }
            },
            onError: (error: unknown) => {
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

// Stock Validation Hook
export const useStockValidation = (options: ValidationOptions = {}) => {
    const { onSuccess, onError } = options;

    const validateMutation = useMutation(
        (items: unknown) => ValidationApiService.validateStockAvailability(items),
        {
            onSuccess: (data: ValidationResult) => {
                if (data.success) {
                    onSuccess?.(data.data);
                } else {
                    onError?.(data.error);
                }
            },
            onError: (error: unknown) => {
                onError?.(error);
            }
        }
    );

    return {
        validateStock: validateMutation.mutate,
        isValidating: validateMutation.isLoading,
        stockData: validateMutation.data?.data,
        stockErrors: (validateMutation.data?.data?.errors as ValidationError[]) || [],
        hasStockIssues: ((validateMutation.data?.data?.errors as ValidationError[])?.length || 0) > 0,
        reset: validateMutation.reset
    };
};

// Credit Validation Hook
interface CreditValidationParams {
    customerId: number;
    amount: number;
}

export const useCreditValidation = (options: ValidationOptions = {}) => {
    const { onSuccess, onError } = options;

    const validateMutation = useMutation(
        ({ customerId, amount }: CreditValidationParams) =>
            ValidationApiService.validateCustomerCredit(customerId, amount),
        {
            onSuccess: (data: ValidationResult) => {
                if (data.success) {
                    onSuccess?.(data.data);
                } else {
                    onError?.(data.error);
                }
            },
            onError: (error: unknown) => {
                onError?.(error);
            }
        }
    );

    return {
        validateCredit: validateMutation.mutate,
        isValidating: validateMutation.isLoading,
        creditData: validateMutation.data?.data,
        creditAvailable: validateMutation.data?.data?.credit_available as boolean | undefined,
        creditWarnings: (validateMutation.data?.data?.warnings as ValidationWarning[]) || [],
        hasCreditIssues: !validateMutation.data?.data?.credit_available,
        reset: validateMutation.reset
    };
};

// Validation Rules Hook
export const useValidationRules = (entityType: string) => {
    const { data: rulesData, isLoading, error, refetch } = useQuery(
        ['validation-rules', entityType],
        () => ValidationApiService.getValidationRules(entityType),
        {
            enabled: !!entityType,
            staleTime: 10 * 60 * 1000,
            cacheTime: 30 * 60 * 1000
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

// Real-time Validation Hook
interface RealTimeValidationOptions extends ValidationOptions {
    validationType?: 'invoice' | 'customer' | 'product' | 'stock';
    debounceMs?: number;
}

interface LastValidation {
    timestamp: number;
    result: ValidationResult | null;
    success: boolean;
    error?: unknown;
}

export const useRealTimeValidation = (options: RealTimeValidationOptions = {}) => {
    const { validationType = 'invoice', debounceMs = 1000, onSuccess, onError } = options;

    const [validationQueue, setValidationQueue] = useState<Array<{ id: number; type: string; data: unknown }>>([]);
    const [lastValidation, setLastValidation] = useState<LastValidation | null>(null);

    const getValidationService = useCallback((type: string, data: unknown) => {
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
        ({ type, data }: { type: string; data: unknown }) => getValidationService(type, data),
        {
            onSuccess: (data: ValidationResult) => {
                setLastValidation({
                    timestamp: Date.now(),
                    result: data,
                    success: data.success
                });
                onSuccess?.(data.data);
            },
            onError: (error: unknown) => {
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

    const triggerValidation = useCallback((type: string, data: unknown) => {
        const validationId = Date.now();

        setValidationQueue(prev => [...prev, { id: validationId, type, data }]);

        setTimeout(() => {
            setValidationQueue(prev => {
                const item = prev.find(v => v.id === validationId);
                if (item && prev[prev.length - 1].id === validationId) {
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

// Form Validation Hook
interface ValidationRule {
    required?: boolean;
    pattern?: RegExp;
    minLength?: number;
    maxLength?: number;
    message?: string;
    custom?: (value: unknown, formData: Record<string, unknown>) => boolean;
}

interface FieldError {
    code: string;
    message: string;
}

export const useFormValidation = <T extends Record<string, unknown>>(
    initialData: T = {} as T,
    validationRules: Record<string, ValidationRule[]> = {}
) => {
    const [formData, setFormData] = useState<T>(initialData);
    const [fieldErrors, setFieldErrors] = useState<Record<string, FieldError>>({});
    const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});

    const validateField = useCallback((fieldName: string, value: unknown): FieldError | null => {
        const rules = validationRules[fieldName];
        if (!rules) return null;

        for (const rule of rules) {
            if (rule.required && (!value || String(value).trim() === '')) {
                return { code: 'REQUIRED', message: rule.message || `${fieldName} is required` };
            }

            if (rule.pattern && value && !rule.pattern.test(String(value))) {
                return { code: 'PATTERN', message: rule.message || `Invalid ${fieldName} format` };
            }

            if (rule.minLength && value && String(value).length < rule.minLength) {
                return { code: 'MIN_LENGTH', message: rule.message || `${fieldName} must be at least ${rule.minLength} characters` };
            }

            if (rule.maxLength && value && String(value).length > rule.maxLength) {
                return { code: 'MAX_LENGTH', message: rule.message || `${fieldName} must be no more than ${rule.maxLength} characters` };
            }

            if (rule.custom && !rule.custom(value, formData)) {
                return { code: 'CUSTOM', message: rule.message || `Invalid ${fieldName}` };
            }
        }

        return null;
    }, [validationRules, formData]);

    const updateField = useCallback((fieldName: string, value: unknown) => {
        setFormData(prev => ({ ...prev, [fieldName]: value }));
        setTouchedFields(prev => ({ ...prev, [fieldName]: true }));

        const error = validateField(fieldName, value);
        setFieldErrors(prev => ({
            ...prev,
            [fieldName]: error as FieldError
        }));
    }, [validateField]);

    const validateAll = useCallback(() => {
        const errors: Record<string, FieldError> = {};
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
        isValid: Object.keys(fieldErrors).filter(k => fieldErrors[k]).length === 0,
        hasErrors: Object.keys(fieldErrors).filter(k => fieldErrors[k]).length > 0,
        getFieldError: (fieldName: string) => fieldErrors[fieldName],
        isFieldTouched: (fieldName: string) => touchedFields[fieldName],
        isFieldValid: (fieldName: string) => !fieldErrors[fieldName] && touchedFields[fieldName]
    };
};
