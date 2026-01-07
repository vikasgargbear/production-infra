/**
 * Custom hook for return calculations
 * Handles all return amount calculations including tax and refunds
 * Follows Indian GST principles: CGST + SGST (intrastate) or IGST (interstate)
 */
import { useMemo } from 'react';

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
        const emptyResult: ReturnCalculations = {
            subtotal: 0,
            totalTax: 0,
            total: 0,
            itemCount: 0,
            totalQuantity: 0,
            breakdown: { cgst: 0, sgst: 0, igst: 0 }
        };

        if (!items || items.length === 0) {
            return emptyResult;
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

            const unit_price = parseFloat(String(item.unit_price)) || 0;
            const discount = parseFloat(String(item.discount_amount)) || 0;

            // Calculate base amount
            const baseAmount = returnQty * unit_price;
            const discountAmount = (discount / 100) * baseAmount;
            const taxableAmount = baseAmount - discountAmount;

            subtotal += taxableAmount;

            if (includeGst) {
                // Calculate tax based on Indian GST rules
                const cgstRate = parseFloat(String(item.cgst_rate)) || 0;
                const sgstRate = parseFloat(String(item.sgst_rate)) || 0;
                const igstRate = parseFloat(String(item.igst_rate)) || 0;

                if (igstRate > 0) {
                    // Interstate: Use IGST
                    const igstAmount = (taxableAmount * igstRate) / 100;
                    igst += igstAmount;
                    totalTax += igstAmount;
                } else {
                    // Intrastate: Use CGST + SGST
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
