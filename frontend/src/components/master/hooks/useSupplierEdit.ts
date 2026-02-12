/**
 * useSupplierEdit Hook
 *
 * Thin wrapper around usePartyEdit with supplier-specific config.
 */

import { usePartyEdit, type FormErrors } from './usePartyEdit';
import { suppliersApi } from '../../../services/api';

export { type FormErrors };

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

export function useSupplierEdit(
    supplier: any | null,
    onSave: () => void,
    onClose: () => void
) {
    const { entityTypes, ...rest } = usePartyEdit<SupplierFormData>({
        partyType: 'supplier',
        partyLabel: 'Supplier',
        idField: 'supplier_id',
        nameField: 'supplier_name',
        api: suppliersApi,
        defaultPaymentTerms: ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Immediate', 'COD'],
        defaultEntityTypes: ['Regular', 'Manufacturer', 'Distributor', 'Importer', 'C&F Agent'],
        getInitialFormData,
        populateFormData: (s: any) => ({
            supplier_name: s.supplier_name || '',
            supplier_code: s.supplier_code || '',
            supplier_type: s.supplier_type || 'Regular',
            gst_number: s.gst_number || '',
            pan_number: s.pan_number || '',
            drug_license_number: s.drug_license_number || '',
            fssai_number: s.fssai_number || '',
            primary_phone: s.primary_phone || '',
            secondary_phone: s.secondary_phone || '',
            email: s.email || '',
            website: s.website || '',
            address_line1: s.address_line1 || '',
            address_line2: s.address_line2 || '',
            city: s.city || '',
            state: s.state || '',
            pincode: s.pincode || '',
            country: s.country || 'India',
            bank_name: s.bank_name || '',
            bank_account_number: s.bank_account_number || '',
            bank_ifsc_code: s.bank_ifsc_code || '',
            bank_branch: s.bank_branch || '',
            payment_terms: s.payment_terms || 'Net 30',
            credit_limit: s.credit_limit || 0,
            credit_days: s.credit_days || 30,
            discount_percentage: s.discount_percentage || 0,
            is_active: s.is_active !== false,
            notes: s.notes || ''
        }),
    }, supplier, onSave, onClose);

    return {
        ...rest,
        supplierTypes: entityTypes,
    };
}

export default useSupplierEdit;
