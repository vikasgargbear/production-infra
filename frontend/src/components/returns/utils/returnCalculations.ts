/**
 * Return Calculation Utilities
 * 
 * Shared calculation functions for returns.
 * TypeScript version of useReturnCalculations logic.
 */

import type {
    BaseReturnItem,
    ReturnCalculation,
    RefundBreakdown,
    RefundMethod
} from '../types/returnsSharedTypes';

/**
 * Calculate return totals for a list of items
 * 
 * @param items - Array of return items
 * @param includeGst - Whether to include GST in calculations
 * @returns Return calculation result
 */
export function calculateReturnTotals(
    items: BaseReturnItem[] = [],
    includeGst: boolean = true
): ReturnCalculation {
    if (!items || items.length === 0) {
        return {
            subtotal: 0,
            totalTax: 0,
            total: 0,
            itemCount: 0,
            totalQuantity: 0,
            breakdown: { cgst: 0, sgst: 0, igst: 0 }
        };
    }

    let subtotal = 0;
    let totalTax = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let itemCount = 0;
    let totalQuantity = 0;

    items.forEach(item => {
        if (!item.selected) return;

        const returnQty = parseFloat(String(item.return_quantity)) || 0;
        if (returnQty <= 0) return;

        itemCount++;
        totalQuantity += returnQty;

        const rate = parseFloat(String(item.rate || item.unit_price)) || 0;
        const discount = parseFloat(String(item.discount_amount)) || 0;

        // Calculate base amount
        const baseAmount = returnQty * rate;
        const discountAmount = (discount / 100) * baseAmount;
        const taxableAmount = baseAmount - discountAmount;

        subtotal += taxableAmount;

        if (includeGst) {
            const cgstRate = parseFloat(String(item.cgst_rate)) || 0;
            const sgstRate = parseFloat(String(item.sgst_rate)) || 0;
            const igstRate = parseFloat(String(item.igst_rate)) || 0;

            if (igstRate > 0) {
                const igstAmount = (taxableAmount * igstRate) / 100;
                igst += igstAmount;
                totalTax += igstAmount;
            } else {
                const cgstAmount = (taxableAmount * cgstRate) / 100;
                const sgstAmount = (taxableAmount * sgstRate) / 100;
                cgst += cgstAmount;
                sgst += sgstAmount;
                totalTax += (cgstAmount + sgstAmount);
            }
        }
    });

    return {
        subtotal: Math.round(subtotal * 100) / 100,
        totalTax: Math.round(totalTax * 100) / 100,
        total: Math.round((subtotal + totalTax) * 100) / 100,
        itemCount,
        totalQuantity,
        breakdown: {
            cgst: Math.round(cgst * 100) / 100,
            sgst: Math.round(sgst * 100) / 100,
            igst: Math.round(igst * 100) / 100
        }
    };
}

/**
 * Calculate refund breakdown based on refund method
 * 
 * @param total - Total refund amount
 * @param refundMethod - Method of refund
 * @param originalPaymentMethod - Original payment method (for 'original_payment')
 * @returns Refund breakdown
 */
export function calculateRefundBreakdown(
    total: number,
    refundMethod: RefundMethod,
    originalPaymentMethod?: string
): RefundBreakdown {
    switch (refundMethod) {
        case 'credit_note':
        case 'debit_note':
            return {
                creditAmount: total,
                cashRefund: 0,
                bankRefund: 0
            };

        case 'cash_refund':
            return {
                creditAmount: 0,
                cashRefund: total,
                bankRefund: 0
            };

        case 'bank_refund':
            return {
                creditAmount: 0,
                cashRefund: 0,
                bankRefund: total
            };

        case 'original_payment':
            if (originalPaymentMethod === 'cash') {
                return { creditAmount: 0, cashRefund: total, bankRefund: 0 };
            } else if (['card', 'upi', 'bank', 'cheque'].includes(originalPaymentMethod || '')) {
                return { creditAmount: 0, cashRefund: 0, bankRefund: total };
            }
            // Default to credit note
            return { creditAmount: total, cashRefund: 0, bankRefund: 0 };

        default:
            return { creditAmount: total, cashRefund: 0, bankRefund: 0 };
    }
}

/**
 * Calculate single item return amount
 * 
 * @param item - Return item
 * @param includeGst - Whether to include GST
 * @returns Item total amount
 */
export function calculateItemReturnAmount(
    item: BaseReturnItem,
    includeGst: boolean = true
): number {
    const returnQty = parseFloat(String(item.return_quantity)) || 0;
    const rate = parseFloat(String(item.rate || item.unit_price)) || 0;
    const discount = parseFloat(String(item.discount_amount)) || 0;

    const baseAmount = returnQty * rate;
    const discountAmount = (discount / 100) * baseAmount;
    const taxableAmount = baseAmount - discountAmount;

    if (!includeGst) {
        return Math.round(taxableAmount * 100) / 100;
    }

    const cgstRate = parseFloat(String(item.cgst_rate)) || 0;
    const sgstRate = parseFloat(String(item.sgst_rate)) || 0;
    const igstRate = parseFloat(String(item.igst_rate)) || 0;

    let taxAmount = 0;
    if (igstRate > 0) {
        taxAmount = (taxableAmount * igstRate) / 100;
    } else {
        taxAmount = (taxableAmount * (cgstRate + sgstRate)) / 100;
    }

    return Math.round((taxableAmount + taxAmount) * 100) / 100;
}

/**
 * Validate return quantity
 * 
 * @param returnQty - Requested return quantity
 * @param originalQty - Original invoice quantity
 * @param previouslyReturned - Already returned quantity
 * @returns Validation result
 */
export function validateReturnQuantity(
    returnQty: number,
    originalQty: number,
    previouslyReturned: number = 0
): { valid: boolean; message?: string } {
    if (returnQty <= 0) {
        return { valid: false, message: 'Return quantity must be greater than 0' };
    }

    const maxReturnable = originalQty - previouslyReturned;
    if (returnQty > maxReturnable) {
        return {
            valid: false,
            message: `Cannot return more than ${maxReturnable} units (already returned: ${previouslyReturned})`
        };
    }

    return { valid: true };
}
