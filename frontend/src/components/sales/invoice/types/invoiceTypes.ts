/**
 * Invoice Module Type Definitions
 * Centralized types for all invoice-related components
 * 
 * IMPORTANT: This is the single source of truth for invoice-related types.
 * Do NOT define duplicate interfaces in component files - import from here.
 * 
 * Used by: InvoiceFlow, InvoiceList, InvoicePreviewEnterprise, InvoiceSearch,
 *          InvoiceSelector, EnterprisePaymentEntry, CustomerCreationModal, etc.
 */

import type {
    CanonicalAllocationSourceKind,
    CanonicalSourceDocumentKind,
    FreeSupplyTaxTreatment as SharedFreeSupplyTaxTreatment,
} from '../../types/salesSharedTypes';
import type { CanonicalImportLine } from '../../utils/documentImport';

// ==================== BASE TYPES ====================

/** Payment method types supported by the system */
export type PaymentMethodType = 'cash' | 'card' | 'upi' | 'bank' | 'check' | 'credit' | 'online' | 'advance';

/** Invoice status values */
export type InvoiceStatus = 'draft' | 'pending' | 'sent' | 'paid' | 'cancelled' | 'overdue' | 'confirmed';

/** Payment status values */
export type PaymentStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'unpaid';

/** Delivery type values */
export type DeliveryType = 'local' | 'courier' | 'self_pickup' | 'transport' | 'PICKUP' | 'DELIVERY' | 'COURIER';

/** GST type - intra-state vs inter-state */
export type GstType = 'CGST/SGST' | 'IGST';

/** Whether free units contribute to the taxable line value. */
export type FreeSupplyTaxTreatment = SharedFreeSupplyTaxTreatment;

// ==================== BANK ACCOUNT ====================

/** Bank account details for payment receiving */
export interface BankAccount {
    id: number | string;
    bank_name: string;
    account_number: string;
    ifsc_code: string;
    branch_name?: string;
}

// ==================== CUSTOMER ADDRESS ====================

/** Customer address structure - used in Customer and elsewhere */
export interface CustomerAddress {
    address_line1?: string;
    address_line2?: string;
    street?: string;
    city?: string;
    state?: string;
    state_code?: string;
    state_name?: string;
    pincode?: string;
    country?: string;
}

// ==================== CUSTOMER ====================

/** Customer/Party information */
export interface Customer {
    // ID fields (various sources use different names)
    id?: number | string;
    customer_id?: number | string;
    party_id?: number | string;

    // Name fields
    customer_name?: string;
    name?: string;

    // Contact
    phone?: string;
    primary_phone?: string;
    mobile?: string;
    email?: string;
    contact_person?: string;

    // GST/Business
    gst_number?: string;
    drug_license_number?: string;
    pan_number?: string;

    // Customer type
    type?: string;
    customer_type?: string;

    // Address (can be string or object depending on source)
    address?: string | CustomerAddress;
    billing_address?: string | CustomerAddress;
    shipping_address?: string | CustomerAddress;
    street_address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    zip?: string;
    country?: string;

    // Legacy/Backend fields supported for compatibility
    contact_info?: {
        primary_phone: string;
        secondary_phone?: string;
        email?: string;
        website?: string;
    };
    address_info?: {
        billing_address: string;
        billing_city: string;
        billing_state: string;
        billing_pincode: string;
        billing_country?: string;
        shipping_address?: string;
        shipping_city?: string;
        shipping_state?: string;
        shipping_pincode?: string;
        shipping_country?: string;
    };

    // Credit & Financials
    credit_limit?: number;
    credit_days?: number;
    outstanding_amount?: number;
    balance?: number;
    current_outstanding?: number;
    outstanding_balance?: number;

    // Status & Metadata
    status?: string;
    is_active?: boolean;
    customer_code?: string;

    // Business
    business_type?: string;
    customer_category?: string;
    total_business_amount?: number;

    // Additional Documents/Details
    drug_license_validity?: string;
    whatsapp_number?: string;

    // Legacy mapping (some duplicates for compatibility)
    primary_email?: string;
    // primary_phone removed (duplicate)
}

// ==================== CUSTOMER FORM DATA ====================

/** Form data structure for customer creation/edit */
export interface CustomerFormData {
    customer_name: string;
    primary_phone: string;
    primary_email: string;

    // ... (skipping to other change)

    eway_bill_no?: string;
    // eway_bill_date removed (duplicate)
    vehicle_number?: string;

    whatsapp_number: string;
    customer_type: string;
    gst_number: string;
    pan_number: string;
    drug_license_number: string;
    drug_license_validity: string;
    credit_limit: number;
    credit_days: number;
    credit_rating: string;
    address: CustomerAddress;
}

// ==================== EMPLOYEE ====================

/** Employee/Sales person information */
export interface Employee {
    employee_id: number | string;
    user_id?: number | null;  // Links to org_users - used as salesperson_id
    full_name: string;
    employee_code?: string;
    designation?: string;
    department?: string;
}

// ==================== INVOICE ITEM ====================

/** Line item in an invoice */
export interface InvoiceItem {
    // Identifiers
    id?: number | string;
    product_id?: number | string;
    invoice_item_id?: number | string;

    // Product info
    product_name?: string;
    name?: string;
    product_code?: string;
    hsn_code?: string;
    product_type?: string;
    requires_prescription?: boolean;

    // Batch info
    batch_number?: string;
    batch_id?: number | string;
    location_id?: string;
    branch_id?: string;
    uom_conversion_id?: string;
    expiry_date?: string;
    manufacturing_date?: string;

    // Quantities
    quantity?: number | string;
    free_quantity?: number | string;
    free_supply_tax_treatment?: FreeSupplyTaxTreatment;
    source_line_id?: string | number;
    source_document_kind?: CanonicalSourceDocumentKind;
    source_allocation_kind?: CanonicalAllocationSourceKind;
    allocation_id?: string;
    command_request_id?: string | null;
    inventory_document_id?: string;
    inventory_document_line_id?: string;
    invoice_dispatch_allocation_id?: string | null;
    dispatch_id?: string | null;
    dispatch_line_id?: string | null;
    base_billed_quantity?: number | string;
    base_free_quantity?: number | string;
    source_billed_quantity?: number | string;
    source_free_quantity?: number | string;
    ordered_quantity?: number | string;
    dispatched_quantity?: number | string;

    // Pricing - CANONICAL ONLY
    unit_price?: number | string;  // Exact string is preserved through the canonical posting boundary
    cost_per_unit?: number;

    // Discounts - CANONICAL ONLY
    discount_percent?: number | string;  // Exact string is preserved through the canonical posting boundary
    discount_amount?: number;   // CANONICAL: calculated discount amount

    // Taxes
    gst_percent?: number | string;
    tax_percent?: number | string;
    cgst_percent?: number;
    sgst_percent?: number;
    igst_percent?: number;
    cgst_rate?: number;
    sgst_rate?: number;
    igst_rate?: number;
    cgst_amount?: number;
    sgst_amount?: number;
    igst_amount?: number;
    tax_amount?: number;

    // Totals
    amount?: number;
    total?: number;
    line_total?: number;

    // Pack info (for pharma) - using backend-standard names
    pack_type?: string;
    pack_size?: number;
    pack_unit?: string;
    units_per_pack?: number;  // Number of units in one pack (e.g., 10 tablets/strip)
    packages_per_box?: number;  // Number of packs in one box (e.g., 10 strips/box)
    sale_unit?: string;

    // Allow index access for flexibility
    [key: string]: any;
}

// ==================== INVOICE TOTALS ====================

/** Calculated totals for an invoice */
export interface InvoiceTotals {
    // Subtotal before discounts
    subtotal?: number;
    gross_amount?: number;

    // Discounts
    total_discount?: number;
    discount_amount?: number;
    additional_discount?: number;

    // Taxable
    taxable_amount?: number;

    // Tax amounts
    tax_amount?: number;
    total_tax?: number;
    cgst_amount?: number;
    sgst_amount?: number;
    igst_amount?: number;

    // Delivery
    delivery_charges?: number;

    // Rounding
    round_off?: number;

    // Final totals
    net_amount?: number;
    total_amount?: number;
    final_amount?: number;

    // Payment tracking
    paid_amount?: number;
    balance_amount?: number;

    // Allow index access
    [key: string]: any;
}

// ==================== PAYMENT ====================

/** Payment record */
export interface Payment {
    id?: string | number;
    method: PaymentMethodType | string;
    amount: number | string;
    reference?: string;
    date?: string;
    mode?: string;
}

/** Payment mode option for UI */
export interface PaymentModeOption {
    id: string;
    label: string;
    description?: string;
    icon?: React.ComponentType<{ className?: string }>;
}

/** Invoice allocation for payment */
export interface InvoiceAllocation {
    invoice_id: string | number;
    amount: number;
}

// ==================== INVOICE ====================

/** Complete invoice document 
 * 
 * Type definition aligned with sales.invoices database schema.
 * Fields marked as required match NOT NULL columns in the database.
 */
export interface Invoice {
    // Document identifiers - DB: invoice_id is integer NOT NULL
    invoice_id: number;  // REQUIRED - matches DB NOT NULL
    invoice_number: string;  // REQUIRED - DB: text NOT NULL
    order_number?: string;

    // Dates - DB: invoice_date is date NOT NULL
    invoice_date: string;  // REQUIRED - DB: date NOT NULL
    order_date?: string;
    due_date?: string;

    // Status
    status?: string;
    invoice_status?: string;
    payment_status?: string;

    // Customer - DB: customer_id is integer NOT NULL, customer_name is text NOT NULL
    customer_id: number;  // REQUIRED - DB: integer NOT NULL
    customer_name: string;  // REQUIRED - DB: text NOT NULL
    customer_details?: Customer | null;
    customer_phone?: string;
    customer_gst_number?: string;

    // Items
    items?: InvoiceItem[];

    // Totals (embedded or flat)
    totals?: InvoiceTotals;
    subtotal_amount?: number;
    gross_amount?: number;
    discount_amount?: number;
    tax_amount?: number;
    total_tax?: number;
    total_amount?: number;
    final_amount?: number;
    cgst_amount?: number;
    sgst_amount?: number;
    igst_amount?: number;
    round_off_amount?: number;

    // Delivery
    delivery_type?: string;
    transport_company?: string;
    vehicle_number?: string;
    driver_phone?: string;
    lr_number?: string;
    delivery_charges?: number;
    is_same_address?: boolean;

    // Linked challan (auto-created)
    challan_id?: number;
    challan_number?: string;

    // Addresses
    billing_address?: string;
    billing_address_data?: CustomerAddress;
    shipping_address?: string;
    shipping_address_data?: CustomerAddress;
    shipping_contact_name?: string;
    shipping_phone?: string;

    // Payment
    payments?: Payment[];
    payment_mode?: string;
    paid_amount?: number;
    balance_amount?: number;

    // Discount
    discount_type?: 'percentage' | 'fixed';
    bill_discount?: number;
    discount_percent?: number;

    // Sales info
    salesperson_id?: number | null;
    org_name?: string;
    company_name?: string;

    // GST
    gst_type?: GstType | string;

    // Bank
    bank_account_id?: number | string;

    // Notes
    notes?: string;

    // E-Invoice
    e_invoice_applicable?: boolean;
    e_invoice_number?: string;
    irn?: string;
    ack_no?: string;
    ack_date?: string;
    qr_code?: string;

    // E-way Bill
    eway_bill_number?: string;
    eway_bill_date?: string;

    eway_bill_valid_upto?: string;

    // Allow index access
    [key: string]: any;
}

/** Type for creating new invoices (before they're saved to DB)
 * Omits invoice_id since it's auto-generated by the database
 */
export type NewInvoice = Omit<Invoice, 'invoice_id'>;


/** Lightweight invoice summary for lists and tables */
export interface InvoiceSummary {
    id: string;
    invoice_id?: string | number;
    invoice_number: string;
    invoice_date: string;
    customer_name: string;
    final_amount: number;
    payment_status: string;
    invoice_status?: string;
    items_count?: number;
    due_date?: string;
    order_number?: string;
    order_date?: string;

    // Legacy support (optional)
    invoiceNumber?: string;
    customerName?: string;
    date?: string;
    amount?: number;
    status?: string;
    paymentStatus?: string;
}

// ==================== INVOICE FILTERS ====================

/** Filters for invoice search/list */
export interface InvoiceFilters {
    status?: string[];
    payment_status?: string[];
    customer_id?: string | number;
    returnable?: boolean;
    dateRange?: DateRange;
}

/** Date range filter */
export interface DateRange {
    from?: string;
    to?: string;
}

// ==================== COMPANY INFO ====================

// Re-export from shared types - single source of truth
export type { CompanyInfo, BankAccount as SharedBankAccount, BusinessSettings } from '../../../../types/common/company.types';

// ==================== PRODUCT INPUT ====================

/** Product data for adding to invoice */
export interface ProductInput {
    product_id?: number | string;
    id?: number | string;
    product_name?: string;
    name?: string;
    product_code?: string;
    batch_id?: number | string | null;
    batch_number?: string;  // Alias used by some search results
    branch_id?: string;
    location_id?: string;
    uom_conversion_id?: string;
    expiry_date?: string;
    manufacturing_date?: string;
    // Pricing - batch level uses _per_unit suffix
    sale_price_per_unit?: number; // Backend field - maps to unit_price
    unit_price?: number;  // CANONICAL: selling price
    mrp_per_unit?: number;
    mrp?: number;
    // Tax
    gst_percent?: number;
    tax_rate?: number;  // Alias from product search
    hsn_code?: string;
    // Quantities
    quantity?: number;
    free_quantity?: number;
    free_supply_tax_treatment?: FreeSupplyTaxTreatment;
    quantity_available?: number;
    available_quantity?: number;
    total_quantity_available?: number;  // Alias from product search
    discount_percent?: number;
}

// ==================== WORKFLOW TYPES ====================

/** Prefilled data when opening invoice flow */
export interface PrefilledData {
    customer?: Customer;
    items?: ProductInput[];
}

/** Import data from order/challan */
export interface ImportData {
    customer?: Customer;
    items?: CanonicalImportLine[];
    delivery_details?: {
        delivery_type?: string;
        delivery_charges?: number;
    };
    delivery_type?: string;
    delivery_charges?: number;
    source?: string;
}

/** Discount configuration */
export interface DiscountData {
    type: 'percentage' | 'fixed';
    amount?: number;
    percentage?: number;
}

/** Data returned after invoice creation */
export interface CreatedInvoiceData {
    invoiceId: string | number;
    invoiceNumber: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    totalAmount: number;
    items: InvoiceItem[];
    isOffline: boolean;
}

// ==================== DISPLAY TYPES ====================

/** Invoice display format for lists/tables */
export interface InvoiceDisplay {
    primary: string;
    secondary: string;
    amount: string;
    status?: string;
    itemCount: number;
}

/** Product for last deal lookup */
export interface ProductForLastDeal {
    id?: number;
    name?: string;
    product_id?: number | string;
    product_name?: string;
}
