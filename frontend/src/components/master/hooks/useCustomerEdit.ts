/**
 * useCustomerEdit Hook
 *
 * Thin wrapper around usePartyEdit with customer-specific config.
 */

import { usePartyEdit, type FormErrors } from './usePartyEdit';
import { customersApi } from '../../../services/api';

export { type FormErrors };

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
    credit_limit: number | '';
    credit_days: number | '';
    discount_percentage: number | '';
    is_active: boolean;
    notes: string;
}

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
    credit_limit: '',
    credit_days: '',
    discount_percentage: '',
    is_active: true,
    notes: ''
});

export function useCustomerEdit(
    customer: any | null,
    onSave: () => void,
    onClose: () => void
) {
    const { entityTypes, ...rest } = usePartyEdit<CustomerFormData>({
        partyType: 'customer',
        partyLabel: 'Customer',
        idField: 'customer_id',
        nameField: 'customer_name',
        api: customersApi,
        defaultPaymentTerms: ['Immediate', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'COD'],
        defaultEntityTypes: ['Retail', 'Wholesale', 'B2B', 'B2C'],
        getInitialFormData,
        populateFormData: (c: any) => ({
            customer_name: c.customer_name || '',
            customer_code: c.customer_code || '',
            customer_type: c.customer_type || 'Retail',
            gst_number: c.gst_number || '',
            pan_number: c.pan_number || '',
            drug_license_number: c.drug_license_number || '',
            fssai_number: c.fssai_number || '',
            primary_phone: c.primary_phone || '',
            secondary_phone: c.secondary_phone || '',
            email: c.email || '',
            address_line1: c.address_line1 || '',
            address_line2: c.address_line2 || '',
            city: c.city || '',
            state: c.state || '',
            pincode: c.pincode || '',
            country: c.country || 'India',
            shipping_address: c.shipping_address || '',
            payment_terms: c.payment_terms || 'Immediate',
            credit_limit: c.credit_limit ?? '',
            credit_days: c.credit_days ?? '',
            discount_percentage: c.discount_percentage ?? '',
            is_active: c.is_active !== false,
            notes: c.notes || ''
        }),
    }, customer, onSave, onClose);

    return {
        ...rest,
        customerTypes: entityTypes,
    };
}

export default useCustomerEdit;
