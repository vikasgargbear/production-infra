/**
 * Invoice Calculator Service
 * Single source of truth for all invoice calculations
 */

class InvoiceCalculator {
  /**
   * Calculate item totals including GST
   * @param {Object} item - Invoice item
   * @returns {Object} Calculated values
   */
  static calculateItem(item) {
    const quantity = parseFloat(item.quantity) || 0;
    const rate = parseFloat(item.sale_price || item.rate || item.selling_price) || 0;
    const discountPercent = parseFloat(item.discount_percent) || 0;
    const gstPercent = parseFloat(item.gst_percent) || 12;

    // Base calculations
    const subtotal = rate * quantity;
    const discountAmount = (subtotal * discountPercent) / 100;
    const taxableAmount = subtotal - discountAmount;
    const gstAmount = (taxableAmount * gstPercent) / 100;
    const totalAmount = taxableAmount + gstAmount;

    return {
      subtotal,
      discountAmount,
      taxableAmount,
      gstAmount,
      cgst: gstAmount / 2,
      sgst: gstAmount / 2,
      totalAmount
    };
  }

  /**
   * Calculate invoice totals from items
   * @param {Array} items - Array of invoice items
   * @param {String} gstType - 'CGST/SGST' or 'IGST'
   * @returns {Object} Invoice totals
   */
  static calculateInvoiceTotals(items, gstType = 'CGST/SGST') {
    let grossAmount = 0;
    let totalDiscount = 0;
    let taxableAmount = 0;
    let gstAmount = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;

    items.forEach(item => {
      const calc = this.calculateItem(item);
      
      grossAmount += calc.subtotal;
      totalDiscount += calc.discountAmount;
      taxableAmount += calc.taxableAmount;
      gstAmount += calc.gstAmount;

      if (gstType === 'CGST/SGST') {
        cgstAmount += calc.cgst;
        sgstAmount += calc.sgst;
      } else {
        igstAmount += calc.gstAmount;
      }
    });

    const netAmount = taxableAmount + gstAmount;
    const roundOff = Math.round(netAmount) - netAmount;
    const finalAmount = Math.round(netAmount);

    return {
      grossAmount: this.round(grossAmount),
      totalDiscount: this.round(totalDiscount),
      taxableAmount: this.round(taxableAmount),
      gstAmount: this.round(gstAmount),
      cgstAmount: this.round(cgstAmount),
      sgstAmount: this.round(sgstAmount),
      igstAmount: this.round(igstAmount),
      netAmount: this.round(netAmount),
      roundOff: this.round(roundOff),
      finalAmount
    };
  }

  /**
   * Determine GST type based on state codes
   * @param {String} sellerGSTIN - Seller's GSTIN
   * @param {String} buyerGSTIN - Buyer's GSTIN
   * @returns {String} 'CGST/SGST' or 'IGST'
   */
  static determineGSTType(sellerGSTIN, buyerGSTIN) {
    if (!sellerGSTIN || !buyerGSTIN) {
      return 'CGST/SGST'; // Default to intra-state
    }

    const sellerStateCode = sellerGSTIN.substring(0, 2);
    const buyerStateCode = buyerGSTIN.substring(0, 2);

    return sellerStateCode === buyerStateCode ? 'CGST/SGST' : 'IGST';
  }

  /**
   * Create a complete invoice item with all calculations
   * @param {Object} productData - Product data from selection
   * @param {Number} quantity - Quantity
   * @param {Number} discountPercent - Discount percentage
   * @returns {Object} Complete invoice item
   */
  static createInvoiceItem(productData, quantity = 1, discountPercent = 0) {
    
    // Use the first available price field
    const sale_price = productData.sale_price || productData.selling_price || productData.rate || productData.mrp || 0;
    
    const item = {
      // Identifiers
      item_id: Date.now() + Math.random(), // Add random to ensure uniqueness
      product_id: productData.product_id,
      product_name: productData.product_name || productData.name || productData.productName || '',
      
      // Batch info
      batch_id: productData.batch_id,
      batch_number: productData.batch_number || productData.batch_no,
      expiry_date: productData.expiry_date,
      
      // Pricing - Single source of truth
      sale_price: sale_price,
      rate: sale_price, // For backward compatibility
      mrp: productData.mrp || sale_price,
      
      // Quantities
      quantity: quantity,
      free_quantity: productData.free_quantity || 0,
      
      // Tax & Discount
      gst_percent: productData.gst_percent || 12,
      discount_percent: discountPercent,
      
      // Other info
      hsn_code: productData.hsn_code,
      available_quantity: productData.available_quantity || productData.quantity_available
    };

    // Calculate all amounts
    const calculations = this.calculateItem(item);
    
    const finalItem = {
      ...item,
      ...calculations
    };
    
    
    return finalItem;
  }

  /**
   * Update item calculations when quantity/discount changes
   * @param {Object} item - Existing item
   * @param {Object} updates - Fields to update
   * @returns {Object} Updated item with recalculated values
   */
  static updateItem(item, updates) {
    const updatedItem = { ...item, ...updates };
    const calculations = this.calculateItem(updatedItem);
    
    return {
      ...updatedItem,
      ...calculations
    };
  }

  /**
   * Round to 2 decimal places
   * @param {Number} value 
   * @returns {Number}
   */
  static round(value, decimals = 2) {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
}

export default InvoiceCalculator;