/**
 * Sales Order Types
 * 
 * Re-exports and additional types for the order module
 */

// Re-export from central types for convenience
export type {
    Order,
    OrderItem,
    Address,
    CalculationResult,
    CreatedOrderData,
    BankAccount
} from '../../../../types/models';

// Local types used in useSalesOrderLogic
export interface Customer {
    customer_id?: number | string;
    id?: number | string;
    customer_name?: string;
    name?: string;
    address?: string;
    address2?: string;
    city?: string;
    state?: string;
    state_name?: string;
    pincode?: string;
    phone?: string;
    primary_phone?: string;
    email?: string;
    gst_number?: string;
    drug_license_number?: string;
}

export interface Employee {
    user_id?: number | string;
    id?: number | string;
    full_name?: string;
    name?: string;
    email?: string;
}

export interface CompanyInfo {
    name?: string;
    address?: string;
    phone?: string;
    email?: string;
    gst_number?: string;
    pan?: string;
    state?: string;
    city?: string;
}

export interface Product {
    product_id: number | string;
    product_name: string;
    product_code?: string;
    hsn_code?: string;
    batch_id?: number | string;
    batch_number?: string;
    batch_number?: string;
    quantity?: number;
    unit?: string;
    uom?: string;
    pack_size?: string;
    pack_type?: string;
    mrp?: number;
    sale_price?: number;
    unit_price?: number;
    gst_percent?: number;
    manufacturer?: string;
    category?: string;
}

export interface ImportData {
    customer_id?: number | string;
    customer_details?: Customer;
    billing_address?: string;
    shipping_address?: string;
    items?: OrderItem[];
    notes?: string;
}

// Order status values
export type OrderStatus = 'draft' | 'pending' | 'approved' | 'processing' | 'completed' | 'cancelled';

// Payment terms
export type PaymentTerms = 'cash' | 'credit' | 'advance' | 'cod';
