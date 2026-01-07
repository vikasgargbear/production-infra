/**
 * useSupplierEdit Hook
 * 
 * Extracts state management and form logic from SupplierEditModal.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { suppliersApi, metadataApi } from '../../../services/api';
import { useToast } from '../../global/ui/feedback/Toast';

// ============================================
// Type Definitions
// ============================================

export interface SupplierFormData {
    supplier_name: string;
    supplier_code: string;
    supplier_type: string;
    gst_number: string;
    pan_number: string;
    drug_license_number: string;
    fssai_number: string;
    primary_phone: string;
    secondary_phone: string;
    email: string;
    website: string;
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
    bank_name: string;
    bank_account_number: string;
    bank_ifsc_code: string;
    bank_branch: string;
    payment_terms: string;
    credit_limit: number;
    credit_days: number;
    discount_percentage: number;
    is_active: boolean;
    notes: string;
}

export interface FormErrors {
    supplier_name?: string;
    gst_number?: string;
    primary_phone?: string;
    email?: string;
    [key: string]: string | undefined;
}

// ============================================
// Default Values
// ============================================

const getInitialFormData = (): SupplierFormData => ({
    supplier_name: '',
    supplier_code: '',
    supplier_type: 'Regular',
    gst_number: '',
    pan_number: '',
    drug_license_number: '',
    fssai_number: '',
    primary_phone: '',
    secondary_phone: '',
    email: '',
    website: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    bank_name: '',
    bank_account_number: '',
    bank_ifsc_code: '',
    bank_branch: '',
    payment_terms: 'Net 30',
    credit_limit: 0,
    credit_days: 30,
    discount_percentage: 0,
    is_active: true,
    notes: ''
});

// ============================================
// Hook Implementation
// ============================================

export function useSupplierEdit(
    supplier: any | null,
    onSave: () => void,
    onClose: () => void
) {
    const { showToast } = useToast();

    const [formData, setFormData] = useState<SupplierFormData>(getInitialFormData());
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});

    // Metadata
    const [states, setStates] = useState<string[]>([]);
    const [paymentTerms, setPaymentTerms] = useState<string[]>([
        'Net 15', 'Net 30', 'Net 45', 'Net 60', 'Immediate', 'COD'
    ]);
    const [supplierTypes, setSupplierTypes] = useState<string[]>([
        'Regular', 'Manufacturer', 'Distributor', 'Importer', 'C&F Agent'
    ]);

    // ============================================
    // Effects
    // ============================================

    useEffect(() => {
        if (supplier) {
            setFormData({
                supplier_name: supplier.supplier_name || '',
                supplier_code: supplier.supplier_code || '',
                supplier_type: supplier.supplier_type || 'Regular',
                gst_number: supplier.gst_number || '',
                pan_number: supplier.pan_number || '',
                drug_license_number: supplier.drug_license_number || '',
                fssai_number: supplier.fssai_number || '',
                primary_phone: supplier.primary_phone || '',
                secondary_phone: supplier.secondary_phone || '',
                email: supplier.email || '',
                website: supplier.website || '',
                address_line1: supplier.address_line1 || '',
                address_line2: supplier.address_line2 || '',
                city: supplier.city || '',
                state: supplier.state || '',
                pincode: supplier.pincode || '',
                country: supplier.country || 'India',
                bank_name: supplier.bank_name || '',
                bank_account_number: supplier.bank_account_number || '',
                bank_ifsc_code: supplier.bank_ifsc_code || '',
                bank_branch: supplier.bank_branch || '',
                payment_terms: supplier.payment_terms || 'Net 30',
                credit_limit: supplier.credit_limit || 0,
                credit_days: supplier.credit_days || 30,
                discount_percentage: supplier.discount_percentage || 0,
                is_active: supplier.is_active !== false,
                notes: supplier.notes || ''
            });
        } else {
            setFormData(getInitialFormData());
        }
        setErrors({});
    }, [supplier]);

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
            // Use default Indian states
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
        // Clear error for this field
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: undefined }));
        }
    }, [errors]);

    const validateForm = useCallback((): boolean => {
        const newErrors: FormErrors = {};

        if (!formData.supplier_name.trim()) {
            newErrors.supplier_name = 'Supplier name is required';
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
            if (supplier?.supplier_id) {
                response = await suppliersApi.update(supplier.supplier_id, formData);
            } else {
                response = await suppliersApi.create(formData);
            }

            if (response.success) {
                showToast(supplier ? 'Supplier updated successfully' : 'Supplier created successfully', 'success');
                onSave();
                onClose();
                return true;
            } else {
                showToast(response.error?.message || 'Failed to save supplier', 'error');
                return false;
            }
        } catch (error: any) {
            showToast(error.message || 'Failed to save supplier', 'error');
            return false;
        } finally {
            setLoading(false);
        }
    }, [formData, supplier, validateForm, onSave, onClose, showToast]);

    const resetForm = useCallback(() => {
        setFormData(getInitialFormData());
        setErrors({});
    }, []);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Form State
        formData,
        errors,
        loading,

        // Metadata
        states,
        paymentTerms,
        supplierTypes,

        // Actions
        handleInputChange,
        handleSubmit,
        validateForm,
        resetForm,

        // Flags
        isEditing: !!supplier
    };
}

export default useSupplierEdit;
