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
import EnterpriseCalculator from '../../../services/enterpriseCalculator';

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
    const result = EnterpriseCalculator.calculateReturnTotals(items, {
        include_gst: includeGst,
        selected_only: true,
        quantity_field: 'return_quantity',
        round_final_amount: false
    });
    const totals = result.totals;

    return {
        subtotal: totals.subtotal_amount || totals.subtotal || 0,
        totalTax: totals.tax_amount || totals.total_tax_amount || 0,
        total: totals.total_amount || totals.final_amount || 0,
        itemCount: result.items.length,
        totalQuantity: totals.total_return_quantity || 0,
        breakdown: {
            cgst: totals.cgst_amount || 0,
            sgst: totals.sgst_amount || 0,
            igst: totals.igst_amount || 0
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
    const calculated = EnterpriseCalculator.calculateReturnLine(item, {
        include_gst: includeGst,
        quantity_field: 'return_quantity'
    });
    return calculated.total_amount;
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
