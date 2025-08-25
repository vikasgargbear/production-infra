/**
 * SIMPLE, FAST Calculator - One source of truth
 * No API calls, no debouncing, just instant math
 */

class SimpleCalculator {
  /**
   * Calculate invoice totals - INSTANT, no delays
   */
  static calculate(data) {
    const items = data.items || [];
    const deliveryCharges = parseFloat(data.delivery_charges) || 0;
    const invoiceDiscount = parseFloat(data.discount_amount) || 0;
    
    // Step 1: Calculate line items
    let subtotal = 0;
    let itemDiscounts = 0;
    
    const calculatedItems = items.map(item => {
      const quantity = parseFloat(item.quantity || item.base_quantity) || 0;
      const rate = parseFloat(item.rate || item.sale_price) || 0;
      const discountPercent = parseFloat(item.discount_percent) || 0;
      const taxPercent = parseFloat(item.gst_percent || item.tax_rate) || 12;
      
      const lineSubtotal = quantity * rate;
      const lineDiscount = (lineSubtotal * discountPercent) / 100;
      const lineTaxable = lineSubtotal - lineDiscount;
      const lineTax = (lineTaxable * taxPercent) / 100;
      const lineTotal = lineTaxable + lineTax;
      
      subtotal += lineSubtotal;
      itemDiscounts += lineDiscount;
      
      return {
        ...item,
        subtotal: lineSubtotal,
        discount_amount: lineDiscount,
        taxable_amount: lineTaxable,
        tax_amount: lineTax,
        total_amount: lineTotal
      };
    });
    
    // Step 2: Calculate totals
    const totalDiscount = itemDiscounts + invoiceDiscount;
    const taxableAmount = subtotal - totalDiscount;
    const taxAmount = calculatedItems.reduce((sum, item) => sum + item.tax_amount, 0);
    
    // Step 3: Final calculation
    const preRoundTotal = taxableAmount + taxAmount + deliveryCharges;
    const roundOff = parseFloat((Math.round(preRoundTotal) - preRoundTotal).toFixed(2));
    const netAmount = Math.round(preRoundTotal);
    
    return {
      items: calculatedItems,
      totals: {
        gross_amount: subtotal,
        total_discount: totalDiscount,
        taxable_amount: taxableAmount,
        tax_amount: taxAmount,
        total_tax: taxAmount,
        delivery_charges: deliveryCharges,
        round_off: roundOff,
        net_amount: netAmount,
        final_amount: netAmount,
        // Legacy field support
        subtotal_amount: taxableAmount,
        discount_amount: totalDiscount
      }
    };
  }
  
  /**
   * Format currency
   */
  static formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  }
}

export default SimpleCalculator;