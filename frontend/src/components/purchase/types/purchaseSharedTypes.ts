/**
 * Purchase Module - Shared Type Definitions
 * 
 * Following sales module pattern with base types + extensions
 */

// ==================== BASE TYPES ====================

/** Base purchase line item - shared across all purchase flows */
export interface BasePurchaseItem {
    id?: number | string;
    product_id: number | string;
    product_name: string;
    hsn_code?: string;

    // Quantities
    quantity: number;
    free_quantity?: number;

    // Pricing
    rate: number;
    discount_percent?: number;
    discount_amount?: number;

    // Tax
    tax_percent?: number;
    cgst_rate?: number;
    sgst_rate?: number;
    igst_rate?: number;

    // Calculated
    taxable_amount?: number;
    tax_amount?: number;
    total_amount?: number;
}

/** Purchase Order Item - for ordering goods */
export interface PurchaseOrderItem extends BasePurchaseItem {
    expected_delivery_date?: string;
    notes?: string;
}

/** Purchase Entry Item - for recording received invoices */
export interface PurchaseEntryItem extends BasePurchaseItem {
    batch_number?: string;
    expiry_date?: string;
    manufacturing_date?: string | null;
    mrp_per_unit?: number;
    sale_price_per_unit?: number;
    cost_per_unit?: number;
    purchase_price?: number; // Alias for cost_per_unit (legacy)
    mrp?: number; // Alias for mrp_per_unit (legacy)
    selling_price?: number; // Alias for sale_price_per_unit (legacy)
}

/** GRN Item - for goods receipt note */
export interface GRNItem extends BasePurchaseItem {
    batch_number?: string;
    expiry_date?: string;
    manufacturing_date?: string | null;
    received_quantity?: number;
    rejected_quantity?: number;
    po_item_id?: number | string;
}

// ==================== BASE DOCUMENT ====================

/** Supplier information */
export interface Supplier {
    supplier_id?: number | string;
    supplier_name: string;
    supplier_details?: {
        phone?: string;
        email?: string;
        address?: string;
        gst_number?: string;
        drug_license_number?: string;
    };
}

/** Base purchase document */
export interface BasePurchaseDocument extends Supplier {
    document_number: string;
    document_date: string;
    items: BasePurchaseItem[];

    // Amounts
    gross_amount: number;
    discount_amount?: number;
    tax_amount: number;
    other_charges?: number;
    round_off?: number;
    net_amount: number;
    final_amount?: number;

    // Metadata
    notes?: string;
    created_by?: string;
    created_at?: string;
}

/** Purchase Order document */
export interface PurchaseOrder extends Omit<BasePurchaseDocument, 'items'> {
    purchase_order_number: string;
    expected_delivery_date?: string;
    items: PurchaseOrderItem[];
    payment_terms?: string;
    delivery_terms?: string;
}

/** Purchase Entry document */
export interface PurchaseEntry extends Omit<BasePurchaseDocument, 'items'> {
    purchase_number: string;
    supplier_invoice_number: string;
    invoice_date: string;
    items: PurchaseEntryItem[];

    // Transport
    transport_company?: string;
    vehicle_number?: string;
    lr_number?: string;

    // Payment
    payment_methods?: Array<{
        method: string;
        amount: number;
        reference?: string;
    }>;
}

/** GRN document */
export interface GRN extends Omit<BasePurchaseDocument, 'items'> {
    grn_number: string;
    grn_date: string;
    purchase_order_id?: number | string;
    purchase_order_number?: string;
    items: GRNItem[];

    // Receipt details
    received_by?: string;
    verified_by?: string;
    quality_check_status?: 'pending' | 'passed' | 'failed';
}

// ==================== CALCULATION RESULTS ====================

export interface PurchaseCalculation {
    gross_amount: number;
    discount_amount: number;
    taxable_amount: number;
    tax_amount: number;
    other_charges: number;
    net_amount: number;
    final_amount: number;
    total_items: number;
    total_quantity: number;
    gst_breakdown: {
        [rate: string]: {
            taxable: number;
            cgst: number;
            sgst: number;
            igst: number;
            total: number;
        };
    };
}

// ==================== CONSTANTS ====================

export const PURCHASE_TYPES = {
    ORDER: 'purchase_order',
    ENTRY: 'purchase_entry',
    GRN: 'grn',
} as const;

export type PurchaseType = typeof PURCHASE_TYPES[keyof typeof PURCHASE_TYPES];

export const PAYMENT_METHODS = {
    CASH: 'cash',
    CARD: 'card',
    UPI: 'upi',
    BANK_TRANSFER: 'bank_transfer',
    CREDIT: 'credit',
} as const;

export type PaymentMethod = typeof PAYMENT_METHODS[keyof typeof PAYMENT_METHODS];
