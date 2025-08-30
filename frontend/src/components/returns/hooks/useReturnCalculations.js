/**
 * Custom hook for return calculations
 * Handles all return amount calculations including tax and refunds
 */
import { useMemo } from 'react';

export function useReturnCalculations(items = [], includeGst = true) {
  const calculations = useMemo(() => {
    if (!items || items.length === 0) {
      return {
        subtotal: 0,
        totalTax: 0,
        total: 0,
        itemCount: 0,
        totalQuantity: 0,
        breakdown: {
          cgst: 0,
          sgst: 0,
          igst: 0
        }
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
      
      const returnQty = parseFloat(item.return_quantity) || 0;
      if (returnQty <= 0) return;
      
      itemCount++;
      totalQuantity += returnQty;
      
      const rate = parseFloat(item.rate) || parseFloat(item.unit_price) || 0;
      const discount = parseFloat(item.discount_amount) || 0;
      
      // Calculate base amount
      const baseAmount = returnQty * rate;
      const discountAmount = (discount / 100) * baseAmount;
      const taxableAmount = baseAmount - discountAmount;
      
      subtotal += taxableAmount;
      
      if (includeGst) {
        // Calculate tax based on what's available
        const cgstRate = parseFloat(item.cgst_rate) || 0;
        const sgstRate = parseFloat(item.sgst_rate) || 0;
        const igstRate = parseFloat(item.igst_rate) || 0;
        const taxPercent = parseFloat(item.tax_percent) || (cgstRate + sgstRate + igstRate);
        
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
  }, [items, includeGst]);

  return calculations;
}

/**
 * Calculate refund amount based on return method
 */
export function calculateRefundAmount(total, returnMethod, originalPaymentMethod) {
  switch (returnMethod) {
    case 'credit_note':
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
      // Refund via original payment method
      if (originalPaymentMethod === 'cash') {
        return {
          creditAmount: 0,
          cashRefund: total,
          bankRefund: 0
        };
      } else if (['card', 'upi', 'bank', 'cheque'].includes(originalPaymentMethod)) {
        return {
          creditAmount: 0,
          cashRefund: 0,
          bankRefund: total
        };
      } else {
        // Default to credit note if payment method unknown
        return {
          creditAmount: total,
          cashRefund: 0,
          bankRefund: 0
        };
      }
    
    default:
      return {
        creditAmount: total,
        cashRefund: 0,
        bankRefund: 0
      };
  }
}