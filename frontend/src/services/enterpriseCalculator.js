/**
 * EnterpriseCalculator - SINGLE SOURCE OF TRUTH FOR ALL CALCULATIONS
 * 
 * ⚠️ WARNING: DO NOT CREATE NEW CALCULATORS!
 * ⚠️ All calculation logic MUST be in this file.
 * 
 * This is the ONLY calculator used across the entire application:
 * ✅ Invoices
 * ✅ Sales Orders  
 * ✅ Delivery Challans
 * ✅ Purchase Orders
 * ✅ Returns
 * ✅ Quotations
 * 
 * If you need new calculation functionality:
 * 1. ADD IT TO THIS FILE
 * 2. Do NOT create wrapper calculators
 * 3. Update this documentation
 * 
 * Architecture:
 * - calculateItem() → Single item calculations
 * - calculateTotals() → Aggregate multiple items
 * - calculateInvoice/Challan/Order() → Document-specific wrappers
 * - calculateDebounced() → Real-time updates with debouncing
 * 
 * Usage:
 * ```javascript
 * import EnterpriseCalculator from './services/enterpriseCalculator';
 * 
 * // Item-level
 * const item = EnterpriseCalculator.calculateItem(itemData);
 * 
 * // Invoice totals
 * const result = EnterpriseCalculator.calculateTotals(items, options);
 * 
 * // Real-time with debounce
 * EnterpriseCalculator.calculateDebounced(invoice, callback);
 * ```
 * 
 * Archived Calculators (Do not use):
 * - SimpleInvoiceCalculator.js → Moved to archive 2024-12-01
 * - InvoiceCalculator.js → Moved to archive 2024-12-01
 */

class EnterpriseCalculator {
  /**
   * Calculate single item - reusable across all modules
   * @param {Object} item - Item with quantity, rate, discount, etc.
   * @param {Object} options - Optional settings like gst_type
   * @returns {Object} Calculated item with all amounts
   */
  static calculateItem(item, options = {}) {
    const gstType = options.gst_type || 'CGST/SGST';
    
    // Parse inputs once - CRITICAL FIX: ALWAYS use quantity for billing
    const rate = parseFloat(item.sale_price || item.rate || item.selling_price || item.unit_price) || 0;
    const quantity = parseFloat(item.quantity) || 0;
    const baseQuantity = quantity; // base_quantity = billable quantity (always same as quantity)
    const freeQuantity = parseFloat(item.free_quantity) || 0;
    const discountPercent = parseFloat(item.discount_percent || item.discount) || 0;
    const gstPercent = parseFloat(item.gst_percent || item.tax_rate || item.gst) || 0;
    
    // PRODUCTION LOGIC: Use quantity for billing calculations
    // Free items are truly FREE and don't affect pricing
    const subtotal = rate * baseQuantity;
    const discountAmount = (subtotal * discountPercent) / 100;
    const taxableAmount = subtotal - discountAmount;
    const gstAmount = (taxableAmount * gstPercent) / 100;
    const totalAmount = taxableAmount + gstAmount;
    
    // GST breakdown
    const cgstAmount = gstType === 'CGST/SGST' ? gstAmount / 2 : 0;
    const sgstAmount = gstType === 'CGST/SGST' ? gstAmount / 2 : 0;
    const igstAmount = gstType === 'IGST' ? gstAmount : 0;
    
    // Return enriched item with all calculations
    return {
      ...item,
      // Quantities
      base_quantity: baseQuantity,
      free_quantity: freeQuantity,
      total_quantity: baseQuantity + freeQuantity,
      
      // Amounts
      rate: this.round(rate),
      subtotal: this.round(subtotal),
      discount_percent: discountPercent,
      discount_amount: this.round(discountAmount),
      taxable_amount: this.round(taxableAmount),
      gst_percent: gstPercent,
      gst_amount: this.round(gstAmount),
      cgst_amount: this.round(cgstAmount),
      sgst_amount: this.round(sgstAmount),
      igst_amount: this.round(igstAmount),
      total_amount: this.round(totalAmount),
      
      // Aliases for different modules
      line_total: this.round(totalAmount),
      calculated_total: this.round(totalAmount),
      tax_amount: this.round(gstAmount),
      
      // Legacy support
      discountAmount: this.round(discountAmount),
      taxableAmount: this.round(taxableAmount),
      gstAmount: this.round(gstAmount),
      totalAmount: this.round(totalAmount),
      cgst: this.round(cgstAmount),
      sgst: this.round(sgstAmount),
      igst: this.round(igstAmount)
    };
  }
  
  /**
   * Calculate totals from items array - used by all modules
   * @param {Array} items - Array of items to sum
   * @param {Object} options - Additional options like delivery_charges
   * @returns {Object} Aggregated totals
   */
  static calculateTotals(items = [], options = {}) {
    // Initialize totals
    let grossAmount = 0;
    let totalDiscount = 0;
    let taxableAmount = 0;
    let totalGst = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;
    
    // Calculate each item and aggregate
    const calculatedItems = items.map(item => {
      const calculated = this.calculateItem(item, options);
      
      // Aggregate totals
      grossAmount += calculated.subtotal;
      totalDiscount += calculated.discount_amount;
      taxableAmount += calculated.taxable_amount;
      totalGst += calculated.gst_amount;
      cgstTotal += calculated.cgst_amount;
      sgstTotal += calculated.sgst_amount;
      igstTotal += calculated.igst_amount;
      
      return calculated;
    });
    
    // Additional charges
    const deliveryCharges = parseFloat(options.delivery_charges) || 0;
    const additionalDiscount = parseFloat(options.additional_discount) || 0;
    
    // Final calculations
    const netAmount = taxableAmount + totalGst + deliveryCharges - additionalDiscount;
    const finalAmount = Math.round(netAmount);
    const roundOff = parseFloat((finalAmount - netAmount).toFixed(2));
    
    
    return {
      items: calculatedItems,
      totals: {
        // Core totals
        gross_amount: this.round(grossAmount),
        total_discount: this.round(totalDiscount),
        taxable_amount: this.round(taxableAmount),
        total_gst: this.round(totalGst),
        cgst_amount: this.round(cgstTotal),
        sgst_amount: this.round(sgstTotal),
        igst_amount: this.round(igstTotal),
        delivery_charges: this.round(deliveryCharges),
        additional_discount: this.round(additionalDiscount),
        net_amount: this.round(netAmount),
        round_off: this.round(roundOff),
        final_amount: finalAmount,
        
        // Aliases for different modules
        subtotal_amount: this.round(taxableAmount),
        discount_amount: this.round(totalDiscount),
        tax_amount: this.round(totalGst),
        total_tax: this.round(totalGst),
        total_amount: finalAmount
      }
    };
  }
  
  /**
   * Calculate invoice - uses base methods
   */
  static calculateInvoice(invoiceData) {
    console.log('🧮 [CALCULATOR] Received invoice data:', invoiceData);
    console.log('🧮 [CALCULATOR] Items:', invoiceData.items?.map(i => ({
      name: i.product_name,
      qty: i.quantity,
      rate: i.unit_price,
      total: i.quantity * i.unit_price
    })));
    
    const result = this.calculateTotals(invoiceData.items || [], {
      gst_type: invoiceData.gst_type,
      delivery_charges: invoiceData.delivery_charges,
      additional_discount: invoiceData.discount_amount || 0  // Apply invoice-level discount (in addition to item discounts)
    });
    
    console.log('🧮 [CALCULATOR] Calculated result:', result);
    
    return result;
  }
  
  /**
   * Calculate challan - uses base methods
   */
  static calculateChallan(challanData) {
    return this.calculateTotals(challanData.items || [], {
      gst_type: challanData.gst_type,
      delivery_charges: challanData.delivery_charges
    });
  }
  
  /**
   * Calculate sales order - uses base methods
   */
  static calculateSalesOrder(orderData) {
    return this.calculateTotals(orderData.items || [], {
      gst_type: orderData.gst_type,
      delivery_charges: orderData.delivery_charges
    });
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
        let result;
        switch(type) {
          case 'invoice':
            result = this.calculateInvoice(data);
            break;
          case 'challan':
            result = this.calculateChallan(data);
            break;
          case 'sales-order':
            result = this.calculateSalesOrder(data);
            break;
          default:
            result = this.calculateTotals(data.items || [], data);
        }
        callback(null, result);
      } catch (error) {
        callback(error, null);
      }
      this.debounceTimeouts.delete(key);
    }, delay);
    
    this.debounceTimeouts.set(key, timeoutId);
  }
  
  /**
   * Round to 2 decimal places
   */
  static round(value, decimals = 2) {
    return Math.round((value + Number.EPSILON) * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
  
  /**
   * Format currency for display
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

export default EnterpriseCalculator;