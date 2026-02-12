/**
 * usePartyEdit Hook
 *
 * Generic hook for customer/supplier edit forms.
 * Eliminates duplication between useCustomerEdit and useSupplierEdit.
 */

import { useState, useEffect, useCallback } from 'react';
import { metadataApi } from '../../../services/api';
import { useToast } from '../../global/ui/feedback/Toast';

export interface FormErrors {
    [key: string]: string | undefined;
}

export interface UsePartyEditConfig<F extends Record<string, any>> {
    partyType: string;
    partyLabel: string;
    idField: string;
    nameField: keyof F;
    api: {
        create: (data: any) => Promise<any>;
        update: (id: any, data: any) => Promise<any>;
    };
    defaultPaymentTerms: string[];
    defaultEntityTypes: string[];
    getInitialFormData: () => F;
    populateFormData: (entity: any) => F;
    extraValidation?: (formData: F, errors: FormErrors) => void;
}

export function usePartyEdit<F extends Record<string, any>>(
    config: UsePartyEditConfig<F>,
    entity: any | null,
    onSave: () => void,
    onClose: () => void
) {
    const toast = useToast();

    const [formData, setFormData] = useState<F>(config.getInitialFormData());
    const [loading, setLoading] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});

    // Metadata
    const [states, setStates] = useState<string[]>([]);
    const [paymentTerms] = useState<string[]>(config.defaultPaymentTerms);
    const [entityTypes] = useState<string[]>(config.defaultEntityTypes);

    useEffect(() => {
        if (entity) {
            setFormData(config.populateFormData(entity));
        } else {
            setFormData(config.getInitialFormData());
        }
        setErrors({});
    }, [entity]);

    useEffect(() => {
        loadMetadata();
    }, []);

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

    const handleInputChange = useCallback((field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: undefined }));
        }
    }, [errors]);

    const validateForm = useCallback((): boolean => {
        const newErrors: FormErrors = {};

        const nameValue = formData[config.nameField];
        if (!nameValue || !String(nameValue).trim()) {
            newErrors[config.nameField as string] = `${config.partyLabel} name is required`;
        }

        if ((formData as any).gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test((formData as any).gst_number)) {
            newErrors.gst_number = 'Invalid GSTIN format';
        }

        if ((formData as any).primary_phone && !/^[6-9]\d{9}$/.test((formData as any).primary_phone)) {
            newErrors.primary_phone = 'Invalid phone number';
        }

        if ((formData as any).email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((formData as any).email)) {
            newErrors.email = 'Invalid email format';
        }

        config.extraValidation?.(formData, newErrors);

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }, [formData, config]);

    const handleSubmit = useCallback(async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (!validateForm()) {
            toast.error('Please fix the errors before submitting');
            return false;
        }

        setLoading(true);
        try {
            let response;
            if (entity?.[config.idField]) {
                response = await config.api.update(entity[config.idField], formData);
            } else {
                response = await config.api.create(formData);
            }

            if (response.data?.success || response.status === 200) {
                toast.success(entity ? `${config.partyLabel} updated successfully` : `${config.partyLabel} created successfully`);
                onSave();
                onClose();
                return true;
            } else {
                toast.error(response.data?.error?.message || `Failed to save ${config.partyType}`);
                return false;
            }
        } catch (error: any) {
            toast.error(error.message || `Failed to save ${config.partyType}`);
            return false;
        } finally {
            setLoading(false);
        }
    }, [formData, entity, validateForm, onSave, onClose, toast, config]);

    const resetForm = useCallback(() => {
        setFormData(config.getInitialFormData());
        setErrors({});
    }, [config]);

    return {
        formData,
        errors,
        loading,
        states,
        paymentTerms,
        entityTypes,
        handleInputChange,
        handleSubmit,
        validateForm,
        resetForm,
        isEditing: !!entity
    };
}

export default usePartyEdit;
