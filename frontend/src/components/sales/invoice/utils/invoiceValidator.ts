/**
 * Runtime Validator for Invoice Data
 * 
 * Enforces canonical field names and catches deprecated aliases
 * Fails fast in development to prevent bugs from reaching production
 */

import type { InvoiceItem } from '../types/invoiceTypes';

// Deprecated field names that should NEVER be used
const DEPRECATED_PRICE_FIELDS = ['sale_price', 'rate', 'selling_price'] as const;
const DEPRECATED_DISCOUNT_FIELDS = ['discount'] as const;
const DEPRECATED_TOTAL_FIELDS = ['total', 'line_total'] as const;

// Detect if running in development (localhost)
const isDevelopment = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168'));

/**
 * Validates an invoice item has no deprecated field names
 * Throws in development (localhost), warns in production
 */
export function validateInvoiceItem(item: any, context: string = 'invoice item'): void {
    const errors: string[] = [];

    // Check for deprecated price fields
    DEPRECATED_PRICE_FIELDS.forEach(field => {
        if (field in item) {
            errors.push(`❌ Deprecated field '${field}' found. Use 'unit_price' instead.`);
        }
    });

    // Check for deprecated discount fields
    DEPRECATED_DISCOUNT_FIELDS.forEach(field => {
        if (field in item && !('discount_percent' in item || 'discount_amount' in item)) {
            errors.push(`❌ Deprecated field '${field}' found. Use 'discount_percent' instead.`);
        }
    });

    // Check for deprecated total fields
    DEPRECATED_TOTAL_FIELDS.forEach(field => {
        if (field in item) {
            errors.push(`❌ Deprecated field '${field}' found. Use 'total_amount' instead.`);
        }
    });

    if (errors.length > 0) {
        const errorMsg = `\n🚨 VALIDATION ERROR in ${context}:\n${errors.join('\n')}\n\nItem: ${JSON.stringify(item, null, 2)}\n`;

        if (isDevelopment) {
            // Development (localhost): Throw error to fail fast
            throw new Error(errorMsg);
        } else {
            // Production: Warn but don't crash
            console.error(errorMsg);
        }
    }
}

/**
 * Validates an array of invoice items
 */
export function validateInvoiceItems(items: any[], context: string = 'invoice'): void {
    items.forEach((item, index) => {
        validateInvoiceItem(item, `${context} item #${index + 1}`);
    });
}

/**
 * Sanitizes an item by removing deprecated fields and warning
 * Use this when importing from external sources
 */
export function sanitizeInvoiceItem(item: any): InvoiceItem {
    const sanitized = { ...item };
    let warnings: string[] = [];

    // Map deprecated price fields to canonical
    if ('sale_price' in sanitized && !sanitized.unit_price) {
        sanitized.unit_price = sanitized.sale_price;
        warnings.push(`Mapped 'sale_price' → 'unit_price'`);
        delete sanitized.sale_price;
    }
    if ('rate' in sanitized && !sanitized.unit_price) {
        sanitized.unit_price = sanitized.rate;
        warnings.push(`Mapped 'rate' → 'unit_price'`);
        delete sanitized.rate;
    }
    if ('selling_price' in sanitized && !sanitized.unit_price) {
        sanitized.unit_price = sanitized.selling_price;
        warnings.push(`Mapped 'selling_price' → 'unit_price'`);
        delete sanitized.selling_price;
    }

    // Map deprecated discount fields to canonical
    if ('discount' in sanitized && !sanitized.discount_percent) {
        sanitized.discount_percent = sanitized.discount;
        warnings.push(`Mapped 'discount' → 'discount_percent'`);
        delete sanitized.discount;
    }

    // Map deprecated total fields to canonical
    if ('total' in sanitized && !sanitized.total_amount) {
        sanitized.total_amount = sanitized.total;
        warnings.push(`Mapped 'total' → 'total_amount'`);
        delete sanitized.total;
    }
    if ('line_total' in sanitized && !sanitized.total_amount) {
        sanitized.total_amount = sanitized.line_total;
        warnings.push(`Mapped 'line_total' → 'total_amount'`);
        delete sanitized.line_total;
    }

    if (warnings.length > 0) {
        console.warn(`⚠️ Sanitized item with deprecated fields:\n${warnings.join('\n')}`);
    }

    return sanitized as InvoiceItem;
}

/**
 * Type guard to ensure item has canonical fields
 */
export function hasCanonicalFields(item: any): item is InvoiceItem {
    return (
        'unit_price' in item &&
        'discount_percent' in item &&
        'total_amount' in item
    );
}
