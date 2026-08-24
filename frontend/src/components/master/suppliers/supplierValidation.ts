export interface SupplierMandatoryFields {
    supplier_name: string;
    phone: string;
    address_line1: string;
    city: string;
    state: string;
    pincode: string;
    whatsapp_number?: string;
    contact_person_phone?: string;
    gst_number?: string;
    pan_number?: string;
}

const indianPhone = (value: string): boolean => {
    const digits = value.replace(/\D/g, '');
    const localDigits = digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)
        : digits;
    return /^[6-9]\d{9}$/.test(localDigits);
};

export const validateSupplierMandatoryFields = (
    form: SupplierMandatoryFields,
): string[] => {
    const errors: string[] = [];
    if (!form.supplier_name.trim()) errors.push('Supplier name is required');
    if (!form.phone.trim()) {
        errors.push('Phone number is required');
    } else if (!indianPhone(form.phone)) {
        errors.push('Phone number must be a valid 10-digit Indian mobile number');
    }
    if (!form.address_line1.trim()) errors.push('Building / street address is required');
    if (!form.city.trim()) errors.push('City is required');
    if (!form.state.trim()) errors.push('State is required');
    if (!form.pincode.trim()) {
        errors.push('Pincode is required');
    } else if (!/^\d{6}$/.test(form.pincode.trim())) {
        errors.push('Pincode must be exactly 6 digits');
    }
    if (form.whatsapp_number?.trim() && !indianPhone(form.whatsapp_number)) {
        errors.push('WhatsApp number must be a valid 10-digit Indian mobile number');
    }
    if (form.contact_person_phone?.trim() && !indianPhone(form.contact_person_phone)) {
        errors.push('Contact person phone must be a valid 10-digit Indian mobile number');
    }
    if (form.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(form.gst_number)) {
        errors.push('Invalid GSTIN format');
    }
    if (form.pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan_number)) {
        errors.push('Invalid PAN format');
    }
    return errors;
};
