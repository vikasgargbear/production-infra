/**
 * Enterprise Sales Order Calculator Service
 * Single source of truth - all calculations via backend API
 */

import api from './api';

class SalesOrderCalculatorEnterprise {
  /**
   * Calculate sales order totals using backend API
   * @param {Object} orderData - Order data with items
   * @returns {Promise<Object>} Complete calculation results
   */
  static async calculateSalesOrder(orderData) {
    try {
      // Use the existing backend calculation API
      const response = await api.post('/calculations/sales-order', {
        customer_id: orderData.customer_id,
        items: orderData.items.map(item => ({
          product_id: item.product_id,
          quantity: parseFloat(item.quantity) || 0,
          unit_price: parseFloat(item.unit_price || item.sale_price || item.rate) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          gst_percent: parseFloat(item.gst_percent || item.tax_percent) || 12
        })),
        gst_type: orderData.gst_type || 'CGST/SGST',
        delivery_charges: parseFloat(orderData.delivery_charges) || 0,
        discount_amount: parseFloat(orderData.discount_amount) || 0
      });

      if (response.data && response.data.success) {
        return {
          success: true,
          line_items: response.data.line_items,
          totals: response.data.totals,
          timestamp: response.data.calculation_timestamp
        };
      } else {
        throw new Error('Invalid calculation response');
      }
    } catch (error) {
      console.error('Sales order calculation failed:', error);
      console.log('Falling back to local calculation...');
      
      // Fallback to local calculation if API fails
      try {
        const { totals, lineItems } = this.calculateLocally(orderData);
        
        return {
          success: true,
          line_items: lineItems,
          totals: totals,
          timestamp: new Date().toISOString()
        };
      } catch (localError) {
        console.error('Local calculation also failed:', localError);
        return {
          success: false,
          error: error.message,
          totals: {
            gross_amount: 0,
            total_discount: 0,
            taxable_amount: 0,
            total_tax: 0,
            final_amount: 0
          }
        };
      }
    }
  }

  /**
   * Calculate locally using the same logic as the fixed backend
   * @param {Object} orderData - Order data with items
   * @returns {Object} Calculation results
   */
  static calculateLocally(orderData) {
    const items = orderData.items || [];
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    
    const calculatedLineItems = items.map(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unit_price || item.sale_price || item.rate) || 0;
      const discountPercent = parseFloat(item.discount_percent) || 0;
      const gstPercent = parseFloat(item.gst_percent || item.tax_percent) || 12;
      
      // Calculate line subtotal (quantity * unit price)
      const lineSubtotal = quantity * unitPrice;
      
      // Apply item discount
      const itemDiscount = (lineSubtotal * discountPercent) / 100;
      const lineSubtotalAfterDiscount = lineSubtotal - itemDiscount;
      
      // Calculate tax on taxable amount (after discount)
      const taxAmount = (lineSubtotalAfterDiscount * gstPercent) / 100;
      
      // Line total = taxable amount + tax
      const lineTotal = lineSubtotalAfterDiscount + taxAmount;
      
      subtotal += lineSubtotal;
      totalDiscount += itemDiscount;
      totalTax += taxAmount;
      
      return {
        ...item,
        line_subtotal: lineSubtotal,
        discount_amount: itemDiscount,
        taxable_amount: lineSubtotalAfterDiscount,
        tax_amount: taxAmount,
        line_total: lineTotal
      };
    });
    
    // Calculate final amounts
    const grossTotal = subtotal; // Sum of (quantity * unit_price)
    const taxableTotal = grossTotal - totalDiscount; // Amount after discount
    const finalTotal = taxableTotal + totalTax; // Final amount including tax
    
    const totals = {
      gross_amount: grossTotal,
      total_discount: totalDiscount,
      taxable_amount: taxableTotal, // This should be the subtotal displayed
      total_tax: totalTax,
      final_amount: finalTotal,
      net_amount: finalTotal,
      round_off: 0,
      delivery_charges: parseFloat(orderData.delivery_charges) || 0
    };
    
    return {
      totals,
      lineItems: calculatedLineItems
    };
  }

  /**
   * Format totals for frontend display
   * @param {Object} totals - Raw totals from backend calculation API
   * @returns {Object} Formatted totals for sales order component
   */
  static formatTotalsForDisplay(totals) {
    return {
      subtotal_amount: totals.taxable_amount || 0, // Frontend expects subtotal_amount (taxable amount after discount)
      discount_amount: totals.total_discount || 0,
      tax_amount: totals.total_tax || 0,
      total_amount: totals.final_amount || 0, // Frontend expects total_amount (grand total)
      final_amount: totals.final_amount || 0,
      cgst_amount: totals.cgst_amount || 0, // Backend provides split tax amounts
      sgst_amount: totals.sgst_amount || 0,
      igst_amount: totals.igst_amount || 0,
      round_off: totals.round_off || 0,
      delivery_charges: totals.delivery_charges || 0,
      gross_amount: totals.gross_amount || 0 // Gross amount before discount
    };
  }

  /**
   * Debounced calculation for real-time updates
   * Following invoice component pattern for consistency
   */
  static debounceTimeouts = new Map();
  
  static calculateDebounced(orderData, callback, delay = 300) {
    const key = 'sales_order_calc';
    
    // Clear previous timeout
    if (this.debounceTimeouts.has(key)) {
      clearTimeout(this.debounceTimeouts.get(key));
    }
    
    // Set new timeout
    const timeoutId = setTimeout(async () => {
      try {
        const result = await this.calculateSalesOrder(orderData);
        callback(null, result);
      } catch (error) {
        callback(error, null);
      }
      this.debounceTimeouts.delete(key);
    }, delay);
    
    this.debounceTimeouts.set(key, timeoutId);
  }

  /**
   * Legacy method for backward compatibility
   */
  static createDebouncedCalculator(callback, delay = 300) {
    return (orderData) => {
      this.calculateDebounced(orderData, (error, result) => {
        if (error) {
          console.error('Debounced calculation error:', error);
          return;
        }
        callback(result);
      }, delay);
    };
  }
}

export default SalesOrderCalculatorEnterprise;