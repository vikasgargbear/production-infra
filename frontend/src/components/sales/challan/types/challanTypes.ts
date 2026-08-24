/**
 * Challan Module Type Definitions
 * Centralized types for all challan-related components
 * 
 * Pattern: Matches invoice module structure
 */

// ==================== BASE TYPES ====================

import type { EditableDecimalValue } from '../../../../utils/exactDecimal';

/** Challan status values */
export type ChallanStatus = 'draft' | 'pending' | 'dispatched' | 'delivered' | 'cancelled';

/** Delivery type values */
export type DeliveryType = 'PICKUP' | 'SAME_DAY' | 'NEXT_DAY' | 'EXPRESS' | 'STANDARD';
export type FreeSupplyTaxTreatment =
    | 'excluded_from_taxable_value'
    | 'included_at_unit_rate';
export type AllocationSourceKind = 'direct_issue' | 'dispatch_allocation';

// ==================== CUSTOMER ====================

/** Customer details for challan */
export interface CustomerDetails {
    customer_id?: string | number;
    customer_name?: string;
    name?: string;
    address?: string;
    address_line1?: string;
    city?: string;
    state?: string;
    pincode?: string;
    gst_number?: string;
    phone?: string;
    primary_phone?: string;
    mobile?: string;
    contact_number?: string;
    contact_person?: string;
}

// ==================== CHALLAN ITEM ====================

/** Line item in a challan */
export interface ChallanItem {
    id: number | string;
    product_id: string | number;
    product_name: string;
    product_code?: string;
    hsn_code?: string;
    batch_id?: string | number | null;
    batch_number?: string;
    expiry_date?: string | null;
    branch_id?: string;
    location_id?: string;
    uom_conversion_id?: string;
    source_order_line_id?: string;
    quantity: string | number;
    free_quantity?: string | number;
    unit?: string;
    base_uom?: string;
    uom_code?: string;
    mrp?: string | number;
    unit_price?: string | number;
    sale_price?: string | number;
    gst_percent?: string | number;
    tax_percent?: string | number;
    discount_percent?: string | number;
    free_supply_tax_treatment?: FreeSupplyTaxTreatment;
    taxable_amount?: EditableDecimalValue;
    cgst_amount?: EditableDecimalValue;
    sgst_amount?: EditableDecimalValue;
    igst_amount?: EditableDecimalValue;
    cess_amount?: number;
    tax_amount?: EditableDecimalValue;
    total_tax_amount?: EditableDecimalValue;
    total?: EditableDecimalValue;
    line_total?: EditableDecimalValue;
    manufacturer?: string;
    category?: string;
    source_line_id?: string | number;
    source_allocation_kind?: AllocationSourceKind;
    allocation_id?: string;
    command_request_id?: string | null;
    inventory_document_id?: string;
    inventory_document_line_id?: string;
    invoice_dispatch_allocation_id?: string | null;
    dispatch_id?: string | null;
    dispatch_line_id?: string | null;
}

// ==================== TRANSPORT DETAILS ====================

/** Transport information for challan */
export interface TransportDetails {
    transport_company?: string;
    transporter_name?: string;  // Alias for transport_company
    vehicle_number?: string;
    vehicle_no?: string;  // Alias for vehicle_number
    driver_name?: string;
    driver_phone?: string;
    lr_number?: string;
    lr_no?: string;  // Alias for lr_number
    eway_bill_number?: string;
    eway_bill_no?: string;  // Alias for eway_bill_number
    freight_charges?: number;
    loading_charges?: number;
    other_charges?: number;
    weight?: string;
}

// ==================== CHALLAN ====================

/** 
 * Main challan data structure matching sales.delivery_challans DB schema
 * Fields marked as required match NOT NULL columns in the database
 */
export interface Challan {
    // Document info - DB: challan_id (integer NOT NULL), challan_number (text NOT NULL), challan_date (date NOT NULL)
    challan_id: number;  // REQUIRED - DB: integer NOT NULL
    challan_number: string;  // REQUIRED - DB: text NOT NULL
    source_order_id?: string;
    challan_date: string;  // REQUIRED - DB: date NOT NULL
    expected_delivery_date: string;
    status: ChallanStatus;
    challan_status?: string;  // DB field name
    delivery_status?: string;  // DB field

    // Customer - DB: customer_id (integer NOT NULL)
    customer_id: string | number;
    customer_name: string;
    customer_details: CustomerDetails | null;

    // Addresses
    billing_address: string;
    delivery_address: string;
    delivery_city: string;
    delivery_state: string;
    delivery_pincode: string;
    delivery_gst_number?: string;  // GST number for delivery location
    delivery_contact_person: string;
    delivery_contact_phone: string;

    // Items
    items: ChallanItem[];

    // Transport - Individual fields (DB style)
    transport_company: string;
    eway_bill_number: string;
    lr_number: string;
    vehicle_number: string;
    driver_name: string;
    driver_phone: string;
    freight_charges: number;

    // Transport - Nested object (UI compatibility)
    transport_details?: TransportDetails;

    // Totals
    total_packages: number;
    total_weight: number;
    total_quantity: EditableDecimalValue;
    total_amount: EditableDecimalValue;
    taxable_amount?: EditableDecimalValue;
    total_tax_amount?: EditableDecimalValue;
    gst_type: 'CGST/SGST' | 'IGST';

    // Notes
    notes: string;
}

/** Type for creating new challans (before they're saved to DB)
 * Omits challan_id since it's auto-generated by the database
 */
export type NewChallan = Omit<Challan, 'challan_id'>;

// ==================== EMPLOYEE ====================

/** Employee/MR information */
export interface Employee {
    employee_id: string | number;
    full_name: string;
    employee_code?: string;
    designation?: string;
    department?: string;
}

// ==================== IMPORT DATA ====================

/** Data structure for importing from invoice/order */
export interface ImportData {
    source_order_id?: string;
    customer_id?: string | number;
    customer_name?: string;
    customer_details?: CustomerDetails;
    billing_address?: string;
    delivery_address?: string;
    delivery_city?: string;
    delivery_state?: string;
    delivery_pincode?: string;
    items?: ChallanItem[];
    reference_doc?: string;
    notes?: string;
}

// ==================== CREATED CHALLAN ====================

/** Response after creating a challan */
export interface CreatedChallanData {
    challan_id: string | number;
    challan_number: string;
    customer_name: string;
    customer_details?: CustomerDetails;
    items: ChallanItem[];
    total_amount: number;
}

// ==================== COMPANY INFO ====================

// Re-export from shared types - single source of truth
export type { CompanyInfo } from '../../../../types/common/company.types';

// ==================== HOOK RETURN TYPE ====================

/** Return type for useChallanLogic hook */
export interface UseChallanLogicReturn {
    // State
    challan: Challan;
    setChallan: React.Dispatch<React.SetStateAction<Challan>>;
    selectedCustomer: CustomerDetails | null;
    setSelectedCustomer: React.Dispatch<React.SetStateAction<CustomerDetails | null>>;
    employees: Employee[];
    selectedMR: Employee | null;
    setSelectedMR: React.Dispatch<React.SetStateAction<Employee | null>>;

    // UI state
    currentStep: number;
    setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
    saving: boolean;
    submissionUnavailableReason: string;
    preparedPreview: import('../../../../services/api/canonicalOperatorActions').CanonicalCommandPreview | null;
    reviewOpen: boolean;
    showCreateCustomer: boolean;
    setShowCreateCustomer: React.Dispatch<React.SetStateAction<boolean>>;
    showCreateProduct: boolean;
    setShowCreateProduct: React.Dispatch<React.SetStateAction<boolean>>;
    showImportModal: boolean;
    setShowImportModal: React.Dispatch<React.SetStateAction<boolean>>;
    showSuccessModal: boolean;
    setShowSuccessModal: React.Dispatch<React.SetStateAction<boolean>>;
    createdChallanData: CreatedChallanData | null;
    sameAsBilling: boolean;
    setSameAsBilling: React.Dispatch<React.SetStateAction<boolean>>;
    newProductName: string;
    setNewProductName: React.Dispatch<React.SetStateAction<string>>;
    fetchingAddress: boolean;
    message: string;
    messageType: string;

    // Refs
    customerSearchRef: React.RefObject<HTMLInputElement>;
    productSearchRef: React.RefObject<HTMLInputElement>;
    itemsTableRef: React.RefObject<any>;
    challanFormRef: React.RefObject<HTMLFormElement>;

    // Handlers
    handleCustomerSelect: (customer: CustomerDetails | null) => Promise<void>;
    handleProductSelect: (product: any) => void;
    handleImport: (importData: ImportData) => Promise<void>;
    updateItem: (index: number, field: string, value: any) => void;
    removeItem: (itemId: number | string) => void;
    saveChallan: () => Promise<void>;
    confirmPreparedChallan: () => Promise<void>;
    closeChallanReview: () => void;
    shareOnWhatsApp: () => void;
    printChallan: () => void;
    thermalPrintChallan: (width?: string) => void;
    generateChallanNumber: () => Promise<void>;
}

// ==================== INITIAL STATE ====================

/** Default/initial challan state */
export const getInitialChallan = (): Challan => ({
    challan_id: 0,  // Will be set when saved
    challan_number: '',
    challan_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customer_id: 0,  // Will be set when customer is selected
    customer_name: '',
    customer_details: null,
    billing_address: '',
    delivery_address: '',
    delivery_city: '',
    delivery_state: '',
    delivery_pincode: '',
    delivery_contact_person: '',
    delivery_contact_phone: '',
    items: [],
    transport_company: '',
    eway_bill_number: '',
    lr_number: '',
    vehicle_number: '',
    driver_name: '',
    driver_phone: '',
    freight_charges: 0,
    status: 'draft',
    total_packages: 0,
    total_weight: 0,
    total_quantity: 0,
    total_amount: 0,
    gst_type: 'CGST/SGST',
    notes: ''
});
