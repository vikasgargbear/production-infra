/**
 * Sales Module
 * Central export for all sales-related components
 */

// Types
export interface InvoiceItem {
    quantity: number;
    rate?: number;
    unit_price?: number;
    tax_rate?: number;
    tax_percent?: number;
    product_id?: number;
    [key: string]: unknown;
}

export interface InvoiceData {
    customer_id?: number;
    items?: InvoiceItem[];
    [key: string]: unknown;
}

export interface InvoiceTotals {
    subtotal: number;
    taxAmount: number;
    total: number;
}

export interface ValidationResult {
    isValid: boolean;
    errors: Record<string, string>;
}

// Main Components
export { default as InvoiceFlow } from './InvoiceFlow';
export { default as InvoiceList } from './InvoiceList';
export { default as SalesOrderFlow } from './SalesOrderFlow';
export { default as SalesOrderManagement } from './SalesOrderManagement';
export { default as ChallanFlow } from './challan/ModularChallanCreatorV5';
export { default as SalesHub } from './SalesHub';

// Sub Components
// BillSummary moved to archive - use BillSummary from global instead
export { default as PaymentDetails } from './ui/PaymentDetails';
// SalesCustomerSelection moved to archive - use CustomerSearch from global instead
export { default as SalesHeader } from './ui/SalesHeader';
export { default as SalesTypeSelector } from './ui/SalesTypeSelector';
export { default as TransportDetails } from './ui/TransportDetails';
export { default as PaymentRecordingModal } from './ui/PaymentRecordingModal';
// ImportDocumentModal moved to archive - unused
export { default as ConvertToInvoiceButton } from './ui/ConvertToInvoiceButton';

// Sales Constants
export const SALES_TYPES = {
    INVOICE: 'invoice',
    CHALLAN: 'challan',
    ORDER: 'order',
    RETURN: 'return'
} as const;

export const PAYMENT_MODES = {
    CASH: 'cash',
    CREDIT: 'credit',
    CARD: 'card',
    UPI: 'upi',
    BANK_TRANSFER: 'bank_transfer',
    CHEQUE: 'cheque'
} as const;

export const PAYMENT_STATUS = {
    PENDING: 'pending',
    PARTIAL: 'partial',
    PAID: 'paid',
    OVERDUE: 'overdue'
} as const;

export const INVOICE_STATUS = {
    DRAFT: 'draft',
    PENDING: 'pending',
    SENT: 'sent',
    PAID: 'paid',
    CANCELLED: 'cancelled'
} as const;

// Sales utilities
export const calculateInvoiceTotal = (
    items: InvoiceItem[],
    discountAmount: number = 0,
    otherCharges: number = 0
): InvoiceTotals => {
    const subtotal = items.reduce((sum, item) => {
        const amount = parseFloat(String(item.quantity)) * parseFloat(String(item.rate || item.unit_price || 0));
        return sum + amount;
    }, 0);

    const taxAmount = items.reduce((sum, item) => {
        const amount = parseFloat(String(item.quantity)) * parseFloat(String(item.rate || item.unit_price || 0));
        const taxRate = parseFloat(String(item.tax_rate || item.tax_percent || 0));
        return sum + (amount * taxRate / 100);
    }, 0);

    return {
        subtotal,
        taxAmount,
        total: subtotal + taxAmount - discountAmount + otherCharges
    };
};

export const validateInvoiceData = (invoiceData: InvoiceData): ValidationResult => {
    const errors: Record<string, string> = {};

    if (!invoiceData.customer_id) {
        errors.customer = 'Customer is required';
    }

    if (!invoiceData.items || invoiceData.items.length === 0) {
        errors.items = 'At least one item is required';
    }

    invoiceData.items?.forEach((item, index) => {
        if (!item.product_id) {
            errors[`item_${index}_product`] = 'Product is required';
        }
        if (!item.quantity || item.quantity <= 0) {
            errors[`item_${index}_quantity`] = 'Valid quantity is required';
        }
    });

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
};

// Note: Use named exports above instead of default export to avoid circular dependency issues
