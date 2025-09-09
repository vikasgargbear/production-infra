/**
 * Simple Invoice Calculator
 * Clean, straightforward calculation without any complexity
 * Just uses EnterpriseCalculator which already works perfectly
 */

import EnterpriseCalculator from './enterpriseCalculator';

class SimpleInvoiceCalculator {
  /**
   * Calculate invoice - SIMPLE version
   * @param {Array} items - Invoice items
   * @param {Number} deliveryCharges - Delivery/transport charges
   * @param {String} gstType - GST type (CGST/SGST or IGST)
   * @returns {Object} Calculated invoice with items and totals
   */
  static calculate(items = [], deliveryCharges = 0, gstType = 'CGST/SGST') {
    // Step 1: Clean the items - ensure we have proper numeric values
    const cleanItems = items.map(item => {
      // Extract the values we need
      const quantity = parseFloat(item.quantity) || 0;
      const freeQuantity = parseFloat(item.free_quantity) || 0;
      const rate = parseFloat(item.rate || item.sale_price || item.unit_price) || 0;
      const discountPercent = parseFloat(item.discount_percent || item.discount) || 0;
      const gstPercent = parseFloat(item.gst_percent || item.tax_rate || item.gst) || 0;
      
      // IMPORTANT: base_quantity is what customer pays for
      // If item has base_quantity set, use it. Otherwise, quantity IS the base_quantity
      const baseQuantity = item.base_quantity !== undefined ? 
        parseFloat(item.base_quantity) : 
        quantity;
      
      return {
        ...item,
        base_quantity: baseQuantity,
        quantity: quantity,
        free_quantity: freeQuantity,
        rate: rate,
        sale_price: rate,
        discount_percent: discountPercent,
        gst_percent: gstPercent,
        tax_rate: gstPercent
      };
    });
    
    // Step 2: Use EnterpriseCalculator to calculate everything
    const result = EnterpriseCalculator.calculateTotals(cleanItems, {
      gst_type: gstType,
      delivery_charges: parseFloat(deliveryCharges) || 0,
      additional_discount: 0  // No header-level discount, only item-level
    });
    
    // Step 3: Return clean result
    return {
      items: result.items,
      totals: result.totals,
      // Also provide flat values for easy access
      subtotal: result.totals.taxable_amount,
      tax: result.totals.total_gst || result.totals.tax_amount,
      deliveryCharges: result.totals.delivery_charges,
      roundOff: result.totals.round_off,
      finalAmount: result.totals.final_amount
    };
  }
  
  /**
   * Simple helper to format currency
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

export default SimpleInvoiceCalculator;