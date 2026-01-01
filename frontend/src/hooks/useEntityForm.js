import { useState, useCallback } from 'react';
import { validators } from '../../components/global/ui/forms/FormComponents';

/**
 * useEntityForm - Shared hook for entity creation forms
 * 
 * Handles:
 * - Form state management
 * - Field updates (including nested objects)
 * - Validation
 * - Submission with loading/error states
 * - Form reset
 * 
 * Usage:
 * const form = useEntityForm({
 *   initialData: { name: '', phone: '' },
 *   onSubmit: (data) => api.create(data),
 *   validate: (data) => ({ name: data.name ? null : 'Required' })
 * });
 * 
 * <input value={form.data.name} onChange={(e) => form.setField('name', e.target.value)} />
 * <button onClick={form.handleSubmit}>Save</button>
 */
export function useEntityForm({
    initialData = {},
    onSubmit,
    onSuccess,
    validate,
    transformBeforeSubmit
}) {
    const [data, setData] = useState(initialData);
    const [errors, setErrors] = useState({});
    const [submitErrors, setSubmitErrors] = useState([]);
    const [saving, setSaving] = useState(false);

    // Set a single field (supports dot notation for nested: 'address.city')
    const setField = useCallback((field, value) => {
        setData(prev => {
            if (field.includes('.')) {
                const [parent, child] = field.split('.');
                return {
                    ...prev,
                    [parent]: {
                        ...prev[parent],
                        [child]: value
                    }
                };
            }
            return { ...prev, [field]: value };
        });

        // Clear field error when user types
        if (errors[field]) {
            setErrors(prev => {
                const next = { ...prev };
                delete next[field];
                return next;
            });
        }
    }, [errors]);

    // Set multiple fields at once
    const setFields = useCallback((updates) => {
        setData(prev => ({ ...prev, ...updates }));
    }, []);

    // Validate form
    const validateForm = useCallback(() => {
        if (!validate) return true;

        const validationErrors = validate(data);

        if (validationErrors && Object.keys(validationErrors).filter(k => validationErrors[k]).length > 0) {
            // Filter out null/undefined values
            const actualErrors = {};
            Object.keys(validationErrors).forEach(key => {
                if (validationErrors[key]) {
                    actualErrors[key] = validationErrors[key];
                }
            });
            setErrors(actualErrors);
            return false;
        }

        setErrors({});
        return true;
    }, [data, validate]);

    // Handle form submission
    const handleSubmit = useCallback(async () => {
        setSubmitErrors([]);

        if (!validateForm()) {
            return false;
        }

        setSaving(true);
        try {
            const submitData = transformBeforeSubmit ? transformBeforeSubmit(data) : data;
            const result = await onSubmit(submitData);

            if (onSuccess) {
                onSuccess(result);
            }

            return result;
        } catch (error) {
            // Parse API errors
            if (error.response?.data?.detail) {
                if (Array.isArray(error.response.data.detail)) {
                    setSubmitErrors(error.response.data.detail.map(err => {
                        if (typeof err === 'string') return err;
                        if (err.msg) return err.loc ? `${err.loc.join('.')} - ${err.msg}` : err.msg;
                        return JSON.stringify(err);
                    }));
                } else if (typeof error.response.data.detail === 'string') {
                    setSubmitErrors([error.response.data.detail]);
                } else {
                    setSubmitErrors([JSON.stringify(error.response.data.detail)]);
                }
            } else {
                setSubmitErrors([error.message || 'An error occurred']);
            }
            return false;
        } finally {
            setSaving(false);
        }
    }, [data, onSubmit, onSuccess, validateForm, transformBeforeSubmit]);

    // Reset form to initial state
    const reset = useCallback(() => {
        setData(initialData);
        setErrors({});
        setSubmitErrors([]);
    }, [initialData]);

    // Check if field has error
    const hasError = useCallback((field) => !!errors[field], [errors]);

    // Get field error message
    const getError = useCallback((field) => errors[field], [errors]);

    return {
        // State
        data,
        errors,
        submitErrors,
        saving,

        // Actions
        setField,
        setFields,
        setData,
        handleSubmit,
        reset,
        validateForm,

        // Helpers
        hasError,
        getError
    };
}

/**
 * Common entity validation rules
 */
export const entityValidation = {
    customer: (data) => ({
        customer_name: !data.customer_name ? 'Customer name is required' : null,
        primary_phone: !data.primary_phone ? 'Phone number is required' :
            !validators.phone(data.primary_phone) ? 'Invalid phone number' : null,
        gst_number: data.gst_number && !validators.gstin(data.gst_number) ? 'Invalid GST format' : null,
        pan_number: data.pan_number && !validators.pan(data.pan_number) ? 'Invalid PAN format' : null
    }),

    supplier: (data) => ({
        supplier_name: !data.supplier_name ? 'Supplier name is required' : null,
        phone: !data.phone ? 'Phone number is required' :
            !validators.phone(data.phone) ? 'Invalid phone number' : null,
        gst_number: data.gst_number && !validators.gstin(data.gst_number) ? 'Invalid GST format' : null,
        pan_number: data.pan_number && !validators.pan(data.pan_number) ? 'Invalid PAN format' : null
    }),

    product: (data) => ({
        product_name: !data.product_name ? 'Product name is required' : null,
        hsn_code: !data.hsn_code ? 'HSN code is required' : null,
        gst_percent: data.gst_percent === undefined ? 'GST rate is required' : null
    })
};

export default useEntityForm;
