/**
 * Invoice Type Definitions
 * Shared types for invoice-related components
 */

import { Customer } from './customer';

/**
 * Invoice item line
 */
export interface InvoiceItem {
    id?: number | string;
    product_id: number | string;
    product_name: string;
    product_code?: string;
    hsn_code?: string;
    batch_id?: number | string;
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
    cgst_percent?: number;
    sgst_percent?: number;
    igst_percent?: number;

    // Units
    unit?: string;
    uom?: string;
    pack_size?: string;
    pack_type?: string;

    // Calculated values (canonical names from enterpriseCalculator)
    // Note: discount_amount is in Discounts section above
    subtotal?: number;             // unit_price × quantity (pre-discount)
    taxable_amount?: number;       // subtotal - discount_amount (post-discount)
    gst_amount?: number;           // Total GST on taxable_amount
    cgst_amount?: number;          // CGST portion
    sgst_amount?: number;          // SGST portion
    igst_amount?: number;          // IGST portion
    total_amount?: number;         // taxable_amount + gst_amount

    // Meta
    manufacturer?: string;
    category?: string;
}

/**
 * Invoice totals summary
 */
export interface InvoiceTotals {
    gross_amount: number;
    total_discount: number;
    taxable_amount: number;
    total_cgst: number;
    total_sgst: number;
    total_igst: number;
    total_tax: number;
    round_off: number;
    final_amount: number;
    items_count?: number;
    total_quantity?: number;
}

/**
 * Payment record
 */
export interface Payment {
    method: string;
    amount: number;
    reference?: string;
    date?: string;
    notes?: string;
}

/**
 * Invoice document
 */
export interface Invoice {
    // Identifiers
    invoice_id?: number | string;
    invoice_number: string;

    // Dates
    invoice_date: string;
    due_date?: string;

    // Customer
    customer_id?: number | string | null;
    customer_name?: string;
    customer_details?: Customer | null;
    customer_phone?: string;
    customer_email?: string;

    // Addresses
    billing_address?: string;
    shipping_address?: string;
    billing_address_data?: {
        address_line1?: string;
        address_line2?: string;
        city?: string;
        state?: string;
        pincode?: string;
        country?: string;
    } | null;
    shipping_address_data?: {
        address_line1?: string;
        address_line2?: string;
        city?: string;
        state?: string;
        pincode?: string;
        country?: string;
    } | null;

    // Items
    items: InvoiceItem[];

    // Financial
    subtotal_amount?: number;
    discount_amount?: number;
    discount_percent?: number;
    tax_amount?: number;
    cgst_amount?: number;
    sgst_amount?: number;
    igst_amount?: number;
    round_off?: number;
    final_amount: number;
    total_amount?: number;

    // GST
    gst_type?: 'CGST/SGST' | 'IGST' | string;
    place_of_supply?: string;

    // Delivery
    delivery_type?: string;
    transport_name?: string;
    vehicle_number?: string;
    freight_charges?: number;

    // Payment
    payment_method?: string;
    payment_status?: string;
    amount_paid?: number;
    balance_amount?: number;
    payments?: Payment[];

    // Meta
    totals?: InvoiceTotals | null;
    notes?: string;
    terms_conditions?: string;
    status?: string;
    created_by?: string | number;
    created_at?: string;
    updated_at?: string;

    // Linked documents
    order_id?: number | string;
    order_number?: string;
    challan_id?: number | string;
    challan_number?: string;
}

/**
 * Invoice creation response data
 */
export interface CreatedInvoiceData {
    invoiceId: number | string;
    invoiceNumber: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    totalAmount: number;
    items?: InvoiceItem[];
}

/**
 * Discount data for bill-level discount
 */
export interface DiscountData {
    type: 'percent' | 'amount';
    value: number;
}

/**
 * Import data from other documents
 */
export interface ImportData {
    customer_id?: number | string;
    customer_details?: Customer;
    items?: InvoiceItem[];
    billing_address?: string;
    shipping_address?: string;
    notes?: string;
}
