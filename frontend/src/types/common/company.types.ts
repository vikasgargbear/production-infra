/**
 * Shared Company Types
 * Single source of truth for company-related interfaces
 * 
 * Used by: CompanyContext, invoiceTypes, challanTypes, and all components
 * that need company information
 */

// ==================== BANK ACCOUNT ====================

/** Bank account details for payment receiving */
export interface BankAccount {
    id: number | string;
    bank_name: string;
    account_number?: string;
    ifsc_code: string;
    branch_name?: string;
    account_name?: string;
    account_type?: string;
    is_default?: boolean;
}

// ==================== BUSINESS SETTINGS ====================

/** Business settings stored in organizations.business_settings JSONB */
export interface BusinessSettings {
    tagline?: string;
    financial_year_start?: string;
    financial_year_end?: string;
    currency?: string;
    currency_symbol?: string;
    invoice_prefix?: string;
    challan_prefix?: string;
    po_prefix?: string;
    return_prefix?: string;
    credit_note_prefix?: string;
    debit_note_prefix?: string;
    default_terms?: string;
    terms_and_conditions?: string;
    default_footer?: string;
    print_format?: string;
    show_signature?: boolean;
    show_logo?: boolean;
    show_bank_details?: boolean;
    [key: string]: any;
}

// ==================== COMPANY INFO ====================

/**
 * Company/Organization information
 * Field names match database columns in master.organizations
 */
export interface CompanyInfo {
    // Basic Details
    name?: string;
    company_name?: string;  // Alias for legacy support
    address?: string;
    city?: string;
    state?: string;
    state_code?: string;
    pincode?: string;

    // Contact
    phone?: string;
    email?: string;
    website?: string;

    // Registration Numbers (consistent with DB column names)
    gst_number?: string;
    pan_number?: string;
    drug_license_number?: string;
    fssai_number?: string;
    msme_number?: string;

    // Media
    logo?: string | null;
    paymentQR?: string | null;
    upiId?: string;

    // Banking
    bankAccounts?: BankAccount[];

    // Settings
    business_settings?: BusinessSettings;
}

// ==================== COMPANY CONTEXT ====================

/** Extended CompanyInfo with context-specific fields */
export interface CompanyContextInfo extends CompanyInfo {
    // Required fields for context (non-optional overrides)
    name: string;
    address: string;
    city: string;
    state: string;
    pincode: string;
    phone: string;
    email: string;
    gst_number: string;
    pan_number: string;
    drug_license_number: string;
    fssai_number: string;
    msme_number: string;
    logo: string | null;
    bankAccounts: BankAccount[];
    paymentQR: string | null;
}

// ==================== TYPE GUARDS ====================

/** Type guard to check if object is a valid CompanyInfo */
export function isCompanyInfo(obj: any): obj is CompanyInfo {
    return obj && typeof obj === 'object' && (obj.name || obj.company_name);
}
