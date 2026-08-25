/**
 * Order Type Definitions
 * Shared types for sales order components
 */

import { Customer } from './customer';
import type { EditableDecimalValue } from '../../utils/exactDecimal';

/**
 * Order item line
 */
export interface OrderItem {
    id: number | string;
    product_id: number | string;
    product_name: string;
    product_code?: string;
    hsn_code?: string;
    batch_id?: number | string | null;
    batch_number?: string;
    expiry_date?: string | null;
    branch_id?: string;
    location_id?: string;
    uom_conversion_id?: string;

    // Quantities
    quantity: string | number;
    free_quantity?: string | number;
    free_supply_tax_treatment?:
        | 'excluded_from_taxable_value'
        | 'included_at_unit_rate';

    // Canonical executed-allocation lineage retained by document imports
    source_line_id?: string | number;
    source_allocation_kind?: 'direct_issue' | 'dispatch_allocation';
    allocation_id?: string;
    command_request_id?: string | null;
    inventory_document_id?: string;
    inventory_document_line_id?: string;
    invoice_dispatch_allocation_id?: string | null;
    dispatch_id?: string | null;
    dispatch_line_id?: string | null;

    // Pricing
    unit_price: string | number;
    mrp?: string | number;
    rate?: string | number;
    sale_price?: string | number;

    // Discounts & Taxes
    discount_percent: string | number;
    discount_amount?: EditableDecimalValue;
    gst_percent: string | number;
    tax_amount?: EditableDecimalValue;
    total_tax_amount?: EditableDecimalValue;
    cgst_amount?: EditableDecimalValue;
    sgst_amount?: EditableDecimalValue;
    igst_amount?: EditableDecimalValue;
    cess_amount?: EditableDecimalValue;

    // Units
    unit?: string;
    uom?: string;
    pack_size?: string;
    pack_type?: string;

    // Calculated values
    subtotal?: EditableDecimalValue;
    total?: EditableDecimalValue;
    calculated_total?: EditableDecimalValue;
    taxable_amount?: EditableDecimalValue;
    line_total?: EditableDecimalValue;

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
    state_name?: string;
    pincode?: string;
    country?: string;
}

/**
 * Sales order document
 */
/**
 * Order entity matching sales.orders database schema
 * Fields marked as required match NOT NULL columns in the database
 */
export interface Order {
    // Identifiers - DB: order_id (integer NOT NULL), order_number (text NOT NULL)
    order_id: number | string;
    order_number: string;  // REQUIRED - DB: text NOT NULL

    // Dates - DB: order_date (date NOT NULL)
    order_date: string;  // REQUIRED - DB: date NOT NULL  
    expected_delivery_date?: string;
    delivery_date?: string;

    // Customer - DB: customer_id (integer NOT NULL)
    customer_id: number | string;
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

    // Financial (all nullable in DB)
    subtotal_amount: EditableDecimalValue;
    discount_amount: EditableDecimalValue;
    tax_amount: EditableDecimalValue;
    cgst_amount: EditableDecimalValue;
    sgst_amount: EditableDecimalValue;
    igst_amount: EditableDecimalValue;
    round_off: EditableDecimalValue;
    total_amount: EditableDecimalValue;
    final_amount?: EditableDecimalValue;
    delivery_charges?: number;
    other_charges: number;
    total_quantity: EditableDecimalValue;

    // GST
    gst_type: string;
    place_of_supply: string;

    // Status & Meta - DB: order_status (text nullable)
    status?: string;  // Alias for order_status for backwards compatibility
    order_status?: string;  // DB field name
    payment_status?: string;  // UI field
    payment_mode?: string;  // UI field
    payment_terms: string;
    reference_no: string;
    sales_person: string;
    delivery_priority?: string;  // DB field: priority level
    priority?: string;  // Alias for delivery_priority
    delivery_type?: string;  // UI field for delivery method
    discount?: number;  // UI field for total discount
    created_by: string | number | null;
    created_by_name?: string;
    terms_conditions: string;
    notes: string;

    // Virtual/calculated fields (not in DB, added by backend or UI)
    invoice_number?: string;  // Populated when order is converted to invoice
    invoice_created?: boolean;  // UI flag
    challan_created?: boolean;  // UI flag

    // Bank details (for print)
    bank_name?: string;
    account_number?: string;
    ifsc_code?: string;
    upi_id?: string;

    // Calculated line items from backend
    calculatedLineItems?: unknown[];
}

/** Type for creating new orders (before they're saved to DB)
 * Omits order_id since it's auto-generated by the database
 */
export type NewOrder = Omit<Order, 'order_id'>;

/**
 * Order creation response data
 */
export interface CreatedOrderData {
    orderId: number | string;
    orderNumber: string;
    customerName: string;
    totalAmount: string;
}

/**
 * Calculation result returned by the canonical calculation API.
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
