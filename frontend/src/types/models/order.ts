/**
 * Order Type Definitions
 * Shared types for sales order components
 */

import { Customer } from './customer';

/**
 * Order item line
 */
export interface OrderItem {
    id: number | string;
    product_id: number | string;
    product_name: string;
    product_code?: string;
    hsn_code?: string;
    batch_id?: number | string;
    batch_number?: string;
    batch_number?: string;
    expiry_date?: string;

    // Quantities
    quantity: number;
    free_quantity?: number;

    // Pricing
    unit_price: number;
    mrp?: number;
    rate?: number;
    sale_price?: number;

    // Discounts & Taxes
    discount_percent: number;
    discount_amount?: number;
    gst_percent: number;
    tax_amount?: number;

    // Units
    unit?: string;
    uom?: string;
    pack_size?: string;
    pack_type?: string;

    // Calculated values
    subtotal?: number;
    total?: number;
    calculated_total?: number;
    taxable_amount?: number;
    line_total?: number;

    // Meta
    manufacturer?: string;
    category?: string;
}

/**
 * Address structure
 */
export interface Address {
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    country?: string;
}

/**
 * Sales order document
 */
export interface Order {
    // Identifiers
    order_id?: number | string;
    order_number: string;

    // Dates
    order_date: string;
    expected_delivery_date?: string;
    delivery_date?: string;

    // Customer
    customer_id: number | string | null;
    customer_name: string;
    customer_details: Customer | null;
    customer_phone?: string;

    // Addresses
    billing_address: string;
    shipping_address: string;
    billing_address_data: Address | null;
    shipping_address_data: Address | null;

    // Items
    items: OrderItem[];

    // Financial
    subtotal_amount: number;
    discount_amount: number;
    tax_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    round_off: number;
    total_amount: number;
    final_amount?: number;
    other_charges: number;
    total_quantity: number;

    // GST
    gst_type: string;
    place_of_supply: string;

    // Status & Meta
    status: string;
    payment_terms: string;
    reference_no: string;
    sales_person: string;
    created_by: string | number | null;
    created_by_name?: string;
    terms_conditions: string;
    notes: string;

    // Bank details (for print)
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    upi_id?: string;

    // Calculated line items from backend
    calculatedLineItems?: unknown[];
}

/**
 * Order creation response data
 */
export interface CreatedOrderData {
    orderId: number | string;
    orderNumber: string;
    customerName: string;
    totalAmount: number;
}

/**
 * Calculation result from EnterpriseCalculator
 */
export interface CalculationResult {
    success: boolean;
    totals?: {
        subtotal_amount?: number;
        discount_amount?: number;
        tax_amount?: number;
        total_amount?: number;
        final_amount?: number;
        cgst_amount?: number;
        sgst_amount?: number;
        igst_amount?: number;
    };
    line_items?: {
        subtotal?: number;
        line_subtotal?: number;
        discount_amount?: number;
        total_tax?: number;
        tax_amount?: number;
        line_total?: number;
        taxable_amount?: number;
    }[];
}

/**
 * Bank account for payment
 */
export interface BankAccount {
    bank_name: string;
    account_number: string;
    ifsc_code: string;
    upi_id?: string;
}
