export interface SupplierMandatoryFields {
    supplier_name: string;
    phone: string;
    email?: string;
    address_line1: string;
    city: string;
    state_code: string;
    pincode: string;
    gst_number?: string;
    pan_number?: string;
    credit_days?: number | '';
}

export type SupplierField = keyof SupplierMandatoryFields;
export type SupplierFieldErrors = Partial<Record<SupplierField, string>>;

interface SupplierValidationIssue {
    field: SupplierField;
    message: string;
}

const indianPhone = (value: string): boolean => {
    const digits = value.replace(/\D/g, '');
    const localDigits = digits.length === 12 && digits.startsWith('91')
        ? digits.slice(2)
        : digits;
    return /^[6-9]\d{9}$/.test(localDigits);
};

const supplierValidationIssues = (
    form: SupplierMandatoryFields,
): SupplierValidationIssue[] => {
    const issues: SupplierValidationIssue[] = [];
    const add = (field: SupplierField, message: string) => issues.push({ field, message });

    if (!form.supplier_name.trim()) add('supplier_name', 'Supplier name is required');
    if (!form.phone.trim()) {
        add('phone', 'Phone number is required');
    } else if (!indianPhone(form.phone)) {
        add('phone', 'Phone number must be a valid 10-digit Indian mobile number');
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        add('email', 'Email address is invalid');
    }
    if (!form.address_line1.trim()) add('address_line1', 'Building / street address is required');
    if (!form.city.trim()) add('city', 'City is required');
    if (!/^\d{2}$/.test(form.state_code.trim())) {
        add('state_code', 'GST state code must contain exactly 2 digits');
    }
    if (!form.pincode.trim()) {
        add('pincode', 'Pincode is required');
    } else if (!/^\d{6}$/.test(form.pincode.trim())) {
        add('pincode', 'Pincode must be exactly 6 digits');
    }
    if (form.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(form.gst_number)) {
        add('gst_number', 'Invalid GSTIN format');
    }
    if (form.gst_number && /^\d{2}$/.test(form.state_code.trim())
        && form.gst_number.slice(0, 2) !== form.state_code.trim()) {
        add('gst_number', 'GSTIN state code must match the address GST state code');
    }
    if (form.pan_number && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(form.pan_number)) {
        add('pan_number', 'Invalid PAN format');
    }
    if (form.credit_days === '') {
        add('credit_days', 'Payment days are required');
    } else if (form.credit_days !== undefined
        && (!Number.isInteger(form.credit_days) || form.credit_days < 0 || form.credit_days > 180)) {
        add('credit_days', 'Payment days must be a whole number from 0 to 180');
    }
    return issues;
};

export const validateSupplierFields = (
    form: SupplierMandatoryFields,
): SupplierFieldErrors => supplierValidationIssues(form).reduce<SupplierFieldErrors>(
    (errors, issue) => ({ ...errors, [issue.field]: errors[issue.field] ?? issue.message }),
    {},
);

export const validateSupplierMandatoryFields = (
    form: SupplierMandatoryFields,
): string[] => supplierValidationIssues(form).map(({ message }) => message);
