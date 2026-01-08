/**
 * Purchase Calculation Utilities
 * 
 * Shared calculation functions for purchase documents.
 */

import type { BasePurchaseItem } from '../types/purchaseSharedTypes';

/**
 * Calculate item totals
 * 
 * @param item - Purchase item
 * @returns Calculated totals
 */
export function calculateItemTotals(item: BasePurchaseItem): {
    taxableAmount: number;
    taxAmount: number;
    totalAmount: number;
} {
    const quantity = parseFloat(String(item.quantity)) || 0;
    const unit_price = parseFloat(String(item.unit_price || item.unit_price)) || 0;
    const discountPercent = parseFloat(String(item.discount_percent)) || 0;

    const baseAmount = quantity * unit_price;
    const discountAmount = (baseAmount * discountPercent) / 100;
    const taxableAmount = baseAmount - discountAmount;

    // Calculate tax
    const taxPercent = parseFloat(String(item.tax_percent || 0));
    const cgstRate = parseFloat(String(item.cgst_rate)) || taxPercent / 2;
    const sgstRate = parseFloat(String(item.sgst_rate)) || taxPercent / 2;
    const igstRate = parseFloat(String(item.igst_rate)) || 0;

    let taxAmount = 0;
    if (igstRate > 0) {
        taxAmount = (taxableAmount * igstRate) / 100;
    } else {
        taxAmount = (taxableAmount * (cgstRate + sgstRate)) / 100;
    }

    return {
        taxableAmount: Math.round(taxableAmount * 100) / 100,
        taxAmount: Math.round(taxAmount * 100) / 100,
        totalAmount: Math.round((taxableAmount + taxAmount) * 100) / 100
    };
}

/**
 * Calculate document totals
 * 
 * @param items - Array of purchase items
 * @returns Document totals
 */
export function calculateDocumentTotals(items: BasePurchaseItem[]): {
    subtotal: number;
    totalDiscount: number;
    totalTax: number;
    grandTotal: number;
    itemCount: number;
    totalQuantity: number;
    taxBreakdown: { cgst: number; sgst: number; igst: number };
} {
    if (!items || items.length === 0) {
        return {
            subtotal: 0,
            totalDiscount: 0,
            totalTax: 0,
            grandTotal: 0,
            itemCount: 0,
            totalQuantity: 0,
            taxBreakdown: { cgst: 0, sgst: 0, igst: 0 }
        };
    }

    let subtotal = 0;
    let totalDiscount = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let totalQuantity = 0;

    items.forEach(item => {
        const qty = parseFloat(String(item.quantity)) || 0;
        const unit_price = parseFloat(String(item.unit_price || item.unit_price)) || 0;
        const discountPercent = parseFloat(String(item.discount_percent)) || 0;

        const baseAmount = qty * unit_price;
        const discountAmount = (baseAmount * discountPercent) / 100;
        const taxableAmount = baseAmount - discountAmount;

        subtotal += taxableAmount;
        totalDiscount += discountAmount;
        totalQuantity += qty;

        // Tax
        const cgstRate = parseFloat(String(item.cgst_rate)) || 0;
        const sgstRate = parseFloat(String(item.sgst_rate)) || 0;
        const igstRate = parseFloat(String(item.igst_rate)) || 0;

        if (igstRate > 0) {
            igst += (taxableAmount * igstRate) / 100;
        } else {
            cgst += (taxableAmount * cgstRate) / 100;
            sgst += (taxableAmount * sgstRate) / 100;
        }
    });

    const totalTax = cgst + sgst + igst;

    return {
        subtotal: Math.round(subtotal * 100) / 100,
        totalDiscount: Math.round(totalDiscount * 100) / 100,
        totalTax: Math.round(totalTax * 100) / 100,
        grandTotal: Math.round((subtotal + totalTax) * 100) / 100,
        itemCount: items.length,
        totalQuantity,
        taxBreakdown: {
            cgst: Math.round(cgst * 100) / 100,
            sgst: Math.round(sgst * 100) / 100,
            igst: Math.round(igst * 100) / 100
        }
    };
}

/**
 * Validate purchase quantity
 * 
 * @param quantity - Quantity to validate
 * @param minQuantity - Minimum order quantity
 * @returns Validation result
 */
export function validatePurchaseQuantity(
    quantity: number,
    minQuantity: number = 0
): { valid: boolean; message?: string } {
    if (quantity <= 0) {
        return { valid: false, message: 'Quantity must be greater than 0' };
    }

    if (minQuantity > 0 && quantity < minQuantity) {
        return { valid: false, message: `Minimum order quantity is ${minQuantity}` };
    }

    return { valid: true };
}

/**
 * Validate GRN quantity against PO
 * 
 * @param receivedQty - Quantity being received
 * @param orderedQty - Originally ordered quantity
 * @param previouslyReceived - Already received quantity
 * @returns Validation result
 */
export function validateGRNQuantity(
    receivedQty: number,
    orderedQty: number,
    previouslyReceived: number = 0
): { valid: boolean; message?: string; warning?: string } {
    if (receivedQty <= 0) {
        return { valid: false, message: 'Quantity must be greater than 0' };
    }

    const pendingQty = orderedQty - previouslyReceived;

    if (receivedQty > pendingQty) {
        return {
            valid: true,
            warning: `Receiving ${receivedQty - pendingQty} more than ordered`
        };
    }

    return { valid: true };
}
