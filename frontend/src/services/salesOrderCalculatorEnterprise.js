/**
 * Enterprise Sales Order Calculator Service
 * Single source of truth - all calculations via backend API
 */

import api from './api';

class SalesOrderCalculatorEnterprise {
  /**
   * Calculate sales order totals via backend API
   * @param {Object} orderData - Order data with items
   * @returns {Promise<Object>} Complete calculation results
   */
  static async calculateSalesOrder(orderData) {
    try {
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

  /**
   * Format totals for frontend display
   * @param {Object} totals - Raw totals from API
   * @returns {Object} Formatted totals
   */
  static formatTotalsForDisplay(totals) {
    return {
      gross_amount: totals.gross_amount || 0,
      total_discount: totals.total_discount || 0,
      taxable_amount: totals.taxable_amount || 0,
      tax_amount: totals.total_tax || 0,
      delivery_charges: totals.delivery_charges || 0,
      order_discount: totals.order_discount || 0,
      net_amount: totals.net_amount || 0,
      round_off: totals.round_off || 0,
      final_amount: totals.final_amount || 0
    };
  }

  /**
   * Debounced calculation for real-time updates
   */
  static createDebouncedCalculator(callback, delay = 300) {
    let timeoutId;

    return (orderData) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        const result = await this.calculateSalesOrder(orderData);
        callback(result);
      }, delay);
    };
  }
}

export default SalesOrderCalculatorEnterprise;