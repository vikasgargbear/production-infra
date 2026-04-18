/**
 * Custom hook for return calculations
 * Handles all return amount calculations including tax and refunds
 * Follows Indian GST principles: CGST + SGST (intrastate) or IGST (interstate)
 */
import { useMemo } from 'react';
import EnterpriseCalculator from '../../../services/enterpriseCalculator';

// ============================================================================
// Types
// ============================================================================

export interface ReturnItem {
    selected?: boolean;
    return_quantity?: number | string;
    unit_price?: number | string;
    discount_amount?: number | string;
    cgst_rate?: number | string;
    sgst_rate?: number | string;
    igst_rate?: number | string;
    tax_percent?: number | string;
}

export interface GSTBreakdown {
    cgst: number;
    sgst: number;
    igst: number;
}

export interface ReturnCalculations {
    subtotal: number;
    totalTax: number;
    total: number;
    itemCount: number;
    totalQuantity: number;
    breakdown: GSTBreakdown;
}

export interface RefundAmount {
    creditAmount: number;
    cashRefund: number;
    bankRefund: number;
}

type ReturnMethod = 'credit_note' | 'cash_refund' | 'bank_refund' | 'original_payment';
type PaymentMethod = 'cash' | 'card' | 'upi' | 'bank' | 'cheque' | string;

// ============================================================================
// Hook
// ============================================================================

export function useReturnCalculations(
    items: ReturnItem[] = [],
    includeGst: boolean = true
): ReturnCalculations {
    const calculations = useMemo((): ReturnCalculations => {
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
    }, [items, includeGst]);

    return calculations;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate refund amount based on return method
 */
export function calculateRefundAmount(
    total: number,
    returnMethod: ReturnMethod,
    originalPaymentMethod?: PaymentMethod
): RefundAmount {
    const creditNoteRefund: RefundAmount = { creditAmount: total, cashRefund: 0, bankRefund: 0 };
    const cashRefund: RefundAmount = { creditAmount: 0, cashRefund: total, bankRefund: 0 };
    const bankRefund: RefundAmount = { creditAmount: 0, cashRefund: 0, bankRefund: total };

    switch (returnMethod) {
        case 'credit_note':
            return creditNoteRefund;

        case 'cash_refund':
            return cashRefund;

        case 'bank_refund':
            return bankRefund;

        case 'original_payment':
            if (originalPaymentMethod === 'cash') {
                return cashRefund;
            } else if (['card', 'upi', 'bank', 'cheque'].includes(originalPaymentMethod || '')) {
                return bankRefund;
            }
            return creditNoteRefund; // Default to credit note

        default:
            return creditNoteRefund;
    }
}
