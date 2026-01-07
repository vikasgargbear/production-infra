/**
 * useCustomerEdit Hook
 * 
 * Extracts state management and form logic from CustomerEditModal.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { customersApi, metadataApi } from '../../../services/api';
import { useToast } from '../../global/ui/feedback/Toast';

// ============================================
// Type Definitions
// ============================================

export interface CustomerFormData {
    customer_name: string;
    customer_code: string;
    customer_type: 'B2B' | 'B2C' | 'Retail' | 'Wholesale';
    gst_number: string;
    pan_number: string;
    drug_license_number: string;
    fssai_number: string;
    primary_phone: string;
    secondary_phone: string;
    email: string;
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    shipping_address: string;
    payment_terms: string;
    credit_limit: number;
    credit_days: number;
    discount_percentage: number;
    is_active: boolean;
    notes: string;
}

export interface FormErrors {
    customer_name?: string;
    gst_number?: string;
    primary_phone?: string;
    email?: string;
    [key: string]: string | undefined;
}

// ============================================
// Default Values
// ============================================

const getInitialFormData = (): CustomerFormData => ({
    customer_name: '',
    customer_code: '',
    customer_type: 'Retail',
    gst_number: '',
    pan_number: '',
    drug_license_number: '',
    fssai_number: '',
    primary_phone: '',
    secondary_phone: '',
    email: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    shipping_address: '',
    payment_terms: 'Immediate',
    credit_limit: 0,
    credit_days: 0,
    discount_percentage: 0,
    is_active: true,
    notes: ''
});

// ============================================
// Hook Implementation
// ============================================

export function useCustomerEdit(
    customer: any | null,
    onSave: () => void,
    onClose: () => void
) {
    const { showToast } = useToast();

    const [formData, setFormData] = useState<CustomerFormData>(getInitialFormData());
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});

    // Metadata
    const [states, setStates] = useState<string[]>([]);
    const [paymentTerms, setPaymentTerms] = useState<string[]>([
        'Immediate', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'COD'
    ]);
    const [customerTypes, setCustomerTypes] = useState<string[]>([
        'Retail', 'Wholesale', 'B2B', 'B2C'
    ]);

    // ============================================
    // Effects
    // ============================================

    useEffect(() => {
        if (customer) {
            setFormData({
                customer_name: customer.customer_name || '',
                customer_code: customer.customer_code || '',
                customer_type: customer.customer_type || 'Retail',
                gst_number: customer.gst_number || '',
                pan_number: customer.pan_number || '',
                drug_license_number: customer.drug_license_number || '',
                fssai_number: customer.fssai_number || '',
                primary_phone: customer.primary_phone || '',
                secondary_phone: customer.secondary_phone || '',
                email: customer.email || '',
                address_line1: customer.address_line1 || '',
                address_line2: customer.address_line2 || '',
                city: customer.city || '',
                state: customer.state || '',
                pincode: customer.pincode || '',
                country: customer.country || 'India',
                shipping_address: customer.shipping_address || '',
                payment_terms: customer.payment_terms || 'Immediate',
                credit_limit: customer.credit_limit || 0,
                credit_days: customer.credit_days || 0,
                discount_percentage: customer.discount_percentage || 0,
                is_active: customer.is_active !== false,
                notes: customer.notes || ''
            });
        } else {
            setFormData(getInitialFormData());
        }
        setErrors({});
    }, [customer]);

    useEffect(() => {
        loadMetadata();
    }, []);

    // ============================================
    // API Actions
    // ============================================

    const loadMetadata = useCallback(async () => {
        try {
            const response = await metadataApi.getStates();
            if (response.data) {
                setStates(response.data.map((s: any) => s.state || s.name || s));
            }
        } catch (error) {
            setStates([
                'Andhra Pradesh', 'Karnataka', 'Kerala', 'Maharashtra', 'Tamil Nadu',
                'Telangana', 'Gujarat', 'Rajasthan', 'Uttar Pradesh', 'Delhi'
            ]);
        }
    }, []);

    // ============================================
    // Form Actions
    // ============================================

    const handleInputChange = useCallback((field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: undefined }));
        }
    }, [errors]);

    const validateForm = useCallback((): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.customer_name.trim()) {
            newErrors.customer_name = 'Customer name is required';
        }

        if (formData.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(formData.gst_number)) {
            newErrors.gst_number = 'Invalid GSTIN format';
        }

        if (formData.primary_phone && !/^[6-9]\d{9}$/.test(formData.primary_phone)) {
            newErrors.primary_phone = 'Invalid phone number';
        }

        if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Invalid email format';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [formData]);

    const handleSubmit = useCallback(async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (!validateForm()) {
            showToast('Please fix the errors before submitting', 'error');
            return false;
        }

        setLoading(true);
        try {
            let response;
            if (customer?.customer_id) {
                response = await customersApi.update(customer.customer_id, formData);
            } else {
                response = await customersApi.create(formData);
            }

            if (response.success) {
                showToast(customer ? 'Customer updated successfully' : 'Customer created successfully', 'success');
                onSave();
                onClose();
                return true;
            } else {
                showToast(response.error?.message || 'Failed to save customer', 'error');
                return false;
            }
        } catch (error: any) {
            showToast(error.message || 'Failed to save customer', 'error');
            return false;
        } finally {
            setLoading(false);
        }
    }, [formData, customer, validateForm, onSave, onClose, showToast]);

    const resetForm = useCallback(() => {
        setFormData(getInitialFormData());
        setErrors({});
    }, []);

    // ============================================
    // Return Value
    // ============================================

    return {
        formData,
        errors,
        loading,
        states,
        paymentTerms,
        customerTypes,
        handleInputChange,
        handleSubmit,
        validateForm,
        resetForm,
        isEditing: !!customer
    };
}

export default useCustomerEdit;
