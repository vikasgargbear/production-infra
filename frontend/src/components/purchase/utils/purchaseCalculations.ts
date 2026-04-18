/**
 * Purchase Calculation Utilities
 * 
 * Shared calculation functions for purchase documents.
 */

import type { BasePurchaseItem } from '../types/purchaseSharedTypes';
import EnterpriseCalculator from '../../../services/enterpriseCalculator';

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
    const calculated = EnterpriseCalculator.calculateItem(item, {
        round_final_amount: false
    });

    return {
        taxableAmount: calculated.taxable_amount || 0,
        taxAmount: calculated.gst_amount || 0,
        totalAmount: calculated.total_amount || 0
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
    const result = EnterpriseCalculator.calculateTotals(items, {
        round_final_amount: false
    });
    const totals = result.totals;
    const totalQuantity = items.reduce((sum, item) => sum + (parseFloat(String(item.quantity)) || 0), 0);

    return {
        subtotal: totals.subtotal_amount || totals.subtotal || 0,
        totalDiscount: totals.discount_amount || totals.total_discount || 0,
        totalTax: totals.total_tax_amount || totals.total_tax || 0,
        grandTotal: totals.total_amount || totals.final_amount || 0,
        itemCount: items.length,
        totalQuantity,
        taxBreakdown: {
            cgst: totals.cgst_amount || 0,
            sgst: totals.sgst_amount || 0,
            igst: totals.igst_amount || 0
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
