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
   * @param {Number} invoiceDiscount - Overall invoice discount amount
   * @returns {Object} Calculated invoice with items and totals
   */
  static calculate(items = [], deliveryCharges = 0, gstType = 'CGST/SGST', invoiceDiscount = 0) {
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
      additional_discount: parseFloat(invoiceDiscount) || 0  // Pass invoice-level discount
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
   * Debounced calculation for real-time updates
   */
  static debounceTimeouts = new Map();

  static calculateDebounced(data, callback, delay = 300, type = 'invoice') {
    const key = `calc_${type}`;

    // Clear previous timeout
    if (this.debounceTimeouts.has(key)) {
      clearTimeout(this.debounceTimeouts.get(key));
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
      try {
        // Extract invoice data
        const items = data.items || [];
        const deliveryCharges = parseFloat(data.delivery_charges) || 0;
        const gstType = data.gst_type || 'CGST/SGST';

        // Handle both discount_amount (fixed) and discount_percent (percentage)
        let invoiceDiscount = 0;
        if (data.discount_type === 'percentage') {
          // Calculate percentage discount from subtotal
          const subtotal = items.reduce((sum, item) => {
            const quantity = parseFloat(item.base_quantity || item.quantity) || 0;
            const rate = parseFloat(item.rate || item.sale_price) || 0;
            return sum + (quantity * rate);
          }, 0);
          invoiceDiscount = (subtotal * parseFloat(data.discount_percent || 0)) / 100;
        } else {
          invoiceDiscount = parseFloat(data.discount_amount) || 0;
        }

        // Calculate using the simple calculator
        const result = this.calculate(items, deliveryCharges, gstType, invoiceDiscount);
        callback(null, result);
      } catch (error) {
        callback(error, null);
      }
      this.debounceTimeouts.delete(key);
    }, delay);

    this.debounceTimeouts.set(key, timeoutId);
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