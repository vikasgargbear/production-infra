/**
 * Challan Module Type Definitions
 * Centralized types for all challan-related components
 * 
 * Pattern: Matches invoice module structure
 */

// ==================== BASE TYPES ====================

/** Challan status values */
export type ChallanStatus = 'draft' | 'pending' | 'dispatched' | 'delivered' | 'cancelled';

/** Delivery type values */
export type DeliveryType = 'PICKUP' | 'SAME_DAY' | 'NEXT_DAY' | 'EXPRESS' | 'STANDARD';

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
    state_name?: string;
    pincode?: string;
    pin_code?: string;
    postal_code?: string;
    gst_number?: string;
    gst_number?: string;
    phone?: string;
    primary_phone?: string;
    mobile?: string;
    contact_number?: string;
    contact_person_name?: string;
}

// ==================== CHALLAN ITEM ====================

/** Line item in a challan */
export interface ChallanItem {
    id: number | string;
    product_id: string | number;
    product_name: string;
    product_code?: string;
    hsn_code?: string;
    batch_id?: string | number;
    batch_number?: string;
    batch_number?: string;
    expiry_date?: string;
    quantity: number;
    unit?: string;
    base_uom?: string;
    uom_code?: string;
    mrp?: number;
    unit_price?: number;
    rate?: number;
    sale_price?: number;
    gst_percent?: number;
    tax_percent?: number;
    total?: number;
    line_total?: number;
    manufacturer?: string;
    category?: string;
}

// ==================== TRANSPORT DETAILS ====================

/** Transport information for challan */
export interface TransportDetails {
    transport_company?: string;
    vehicle_number?: string;
    driver_name?: string;
    driver_phone?: string;
    lr_number?: string;
    eway_bill_number?: string;
    freight_charges?: number;
    loading_charges?: number;
    other_charges?: number;
    weight?: string;
}

// ==================== CHALLAN ====================

/** Main challan data structure */
export interface Challan {
    // Document info
    challan_number: string;
    challan_date: string;
    expected_delivery_date: string;
    status: ChallanStatus;

    // Customer
    customer_id: string | number;
    customer_name: string;
    customer_details: CustomerDetails | null;

    // Addresses
    billing_address: string;
    delivery_address: string;
    delivery_city: string;
    delivery_state: string;
    delivery_pincode: string;
    delivery_contact_person_name: string;
    delivery_contact_phone: string;

    // Items
    items: ChallanItem[];

    // Transport
    transport_company: string;
    eway_bill_number: string;
    lr_number: string;
    vehicle_number: string;
    driver_name: string;
    driver_phone: string;
    freight_charges: number;

    // Totals
    total_packages: number;
    total_weight: number;
    total_quantity: number;
    total_amount: number;

    // Notes
    notes: string;
}

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
    customer_id?: string | number;
    customer_name?: string;
    customer_details?: CustomerDetails;
    billing_address?: string;
    delivery_address?: string;
    delivery_city?: string;
    delivery_state?: string;
    delivery_pincode?: string;
    items?: ChallanItem[];
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

/** Company information for preview/print */
export interface CompanyInfo {
    name?: string;
    address?: string;
    gst_number?: string;
    logo?: string;
    drugLicense?: string;
}

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
    handleImport: (importData: ImportData) => void;
    updateItem: (index: number, field: string, value: any) => void;
    removeItem: (itemId: number | string) => void;
    saveChallan: () => Promise<void>;
    shareOnWhatsApp: () => void;
    printChallan: () => void;
    thermalPrintChallan: (width?: string) => void;
    generateChallanNumber: () => Promise<void>;
}

// ==================== INITIAL STATE ====================

/** Default/initial challan state */
export const getInitialChallan = (): Challan => ({
    challan_number: '',
    challan_date: new Date().toISOString().split('T')[0],
    expected_delivery_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    customer_id: '',
    customer_name: '',
    customer_details: null,
    billing_address: '',
    delivery_address: '',
    delivery_city: '',
    delivery_state: '',
    delivery_pincode: '',
    delivery_contact_person_name: '',
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
    notes: ''
});
