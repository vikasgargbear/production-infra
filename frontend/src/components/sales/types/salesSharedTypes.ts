/**
 * Sales Module - Shared Type Definitions
 * 
 * Common types used across invoice, challan, and order modules.
 * IMPORTANT: Module-specific types still reside in their respective folders.
 * This file contains only the truly shared abstractions.
 */

import type { EditableDecimalValue } from '../../../utils/exactDecimal';

// ==================== BASE ENUMS / UNION TYPES ====================

/** Generic document status (foundation for specific statuses) */
export type DocumentStatus = 'draft' | 'pending' | 'confirmed' | 'cancelled';

/** Payment status across all sales documents */
export type PaymentStatusType = 'pending' | 'partial' | 'paid' | 'overdue' | 'unpaid';

/** Delivery type options */
export type DeliveryTypeBase = 'PICKUP' | 'DELIVERY' | 'COURIER' | 'TRANSPORT';

export type FreeSupplyTaxTreatment =
    | 'excluded_from_taxable_value'
    | 'included_at_unit_rate';

export type CanonicalAllocationSourceKind =
    | 'direct_issue'
    | 'dispatch_allocation';

export type CanonicalSourceDocumentKind =
    | 'sales_order'
    | 'delivery_challan'
    | 'sales_invoice';

/**
 * Decimal values in an active canonical sales draft stay as strings.  The
 * number member exists only for operator-entered safe-integer defaults while
 * a draft is being edited; API-owned fractions must never cross through an
 * IEEE-754 conversion.
 */
export type SalesDecimal = EditableDecimalValue;

// ==================== EMPLOYEE (SHARED) ====================

/** Employee / Sales Representative / M.R. */
export interface BaseEmployee {
    employee_id: string | number;
    full_name: string;
    employee_code?: string;
    designation?: string;
    department?: string;
}

// ==================== CUSTOMER (SHARED CORE) ====================

/** Core customer fields used across all sales documents - aligned with backend schema */
export interface BaseCustomer {
    // Primary identifiers
    customer_id?: string | number;
    customer_name?: string;

    // Contact - backend uses primary_phone, not phone/mobile
    primary_phone?: string;
    secondary_phone?: string;
    whatsapp_number?: string;
    email?: string;
    contact_person?: string;  // Backend uses contact_person, not contact_person
    contact_person_phone?: string;
    contact_person_email?: string;

    // GST
    gst_number?: string;
    pan_number?: string;

    // Address (flat structure) - backend uses pincode, not pincode
    address?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
}

// ==================== LINE ITEM (SHARED CORE) ====================

/** Core fields for any sales line item - aligned with backend schema */
export interface BaseLineItem {
    id?: number | string;
    product_id: string | number;
    product_name: string;

    // Batch - backend uses batch_number
    batch_id?: string | number | null;
    batch_number?: string;
    expiry_date?: string | null;

    // Quantity
    quantity: SalesDecimal;
    free_quantity?: SalesDecimal;
    free_supply_tax_treatment?: FreeSupplyTaxTreatment;
    unit?: string;

    // Immutable executed-allocation lineage retained by canonical imports.
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
    base_billed_quantity?: SalesDecimal;
    base_free_quantity?: SalesDecimal;
    source_billed_quantity?: SalesDecimal;
    source_free_quantity?: SalesDecimal;

    // Pricing - backend uses unit_price and mrp
    mrp?: SalesDecimal;
    unit_price?: SalesDecimal;
    discount_percent?: SalesDecimal;

    // Tax
    gst_percent?: SalesDecimal;
    hsn_code?: string;
    cgst_amount?: SalesDecimal;
    sgst_amount?: SalesDecimal;
    igst_amount?: SalesDecimal;

    // Totals - backend uses line_total
    line_total?: SalesDecimal;
}

// ==================== TRANSPORT DETAILS (SHARED) ====================

/** Transport/delivery details used across challan and invoice */
export interface BaseTransportDetails {
    transport_company?: string;
    vehicle_number?: string;
    driver_name?: string;
    driver_phone?: string;
    lr_number?: string;
    eway_bill_number?: string;
    freight_charges?: number;
}

// ==================== CALLBACK TYPES ====================

/** Common callback for customer selection */
export type OnCustomerSelect<T extends BaseCustomer = BaseCustomer> = (customer: T | null) => void | Promise<void>;

/** Common callback for product selection */
export type OnProductSelect = (product: unknown) => void;

/** Common callback for item update */
export type OnItemUpdate = (index: number, field: string, value: unknown) => void;

/** Common callback for item removal */
export type OnItemRemove = (indexOrId: number | string) => void;

// ==================== HOOK COMMON RETURN STRUCTURE ====================

/** Common state and handlers returned by all sales logic hooks */
export interface BaseSalesHookReturn<
    TDocument,
    TCustomer extends BaseCustomer = BaseCustomer
> {
    // Document state
    document: TDocument;
    setDocument: React.Dispatch<React.SetStateAction<TDocument>>;

    // Customer
    selectedCustomer: TCustomer | null;
    setSelectedCustomer: React.Dispatch<React.SetStateAction<TCustomer | null>>;

    // Employees
    employees: BaseEmployee[];
    selectedMR: BaseEmployee | null;
    setSelectedMR: React.Dispatch<React.SetStateAction<BaseEmployee | null>>;

    // Saving
    saving: boolean;

    // Common handlers
    handleCustomerSelect: OnCustomerSelect<TCustomer>;
    handleProductSelect: OnProductSelect;
    handleItemUpdate: OnItemUpdate;
    handleItemRemove: OnItemRemove;
}

// ==================== IMPORT DATA (GENERIC) ====================

/** Generic import data structure */
export interface BaseImportData<TCustomer extends BaseCustomer = BaseCustomer, TItem extends BaseLineItem = BaseLineItem> {
    customer_id?: string | number;
    customer_name?: string;
    customer_details?: TCustomer;
    items?: TItem[];
    notes?: string;
}

// ==================== COMPANY INFO (SHARED) ====================

/** Company information for previews and prints */
export interface BaseCompanyInfo {
    name?: string;
    address?: string;
    gst_number?: string;
    phone?: string;
    email?: string;
    logo?: string;
    drugLicense?: string;
}
