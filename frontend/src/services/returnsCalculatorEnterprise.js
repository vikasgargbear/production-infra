/**
 * Enterprise Returns Calculator Service
 * Single source of truth - all return calculations via backend API
 */

import api from './api';

class ReturnsCalculatorEnterprise {
  /**
   * Calculate sales return totals via backend API
   * @param {Object} returnData - Return data with items
   * @returns {Promise<Object>} Complete calculation results
   */
  static async calculateSalesReturn(returnData) {
    try {
      const response = await api.post('/calculations/sales-return', {
        customer_id: returnData.customer_id,
        items: returnData.items.map(item => ({
          product_id: item.product_id,
          return_quantity: parseFloat(item.return_quantity || item.quantity) || 0,
          unit_price: parseFloat(item.unit_price || item.sale_price || item.rate) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          gst_percent: parseFloat(item.gst_percent || item.tax_percent) || 12
        })),
        gst_type: returnData.gst_type || 'CGST/SGST',
        adjustment_amount: parseFloat(returnData.adjustment_amount) || 0
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
      console.error('Sales return calculation failed:', error);
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
   * Calculate purchase return totals via backend API
   * @param {Object} returnData - Return data with items
   * @returns {Promise<Object>} Complete calculation results
   */
  static async calculatePurchaseReturn(returnData) {
    try {
      const response = await api.post('/calculations/purchase-return', {
        supplier_id: returnData.supplier_id,
        items: returnData.items.map(item => ({
          product_id: item.product_id,
          return_quantity: parseFloat(item.return_quantity || item.quantity) || 0,
          purchase_price: parseFloat(item.purchase_price || item.rate) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          gst_percent: parseFloat(item.gst_percent || item.tax_percent) || 12
        })),
        gst_type: returnData.gst_type || 'CGST/SGST',
        adjustment_amount: parseFloat(returnData.adjustment_amount) || 0
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
      console.error('Purchase return calculation failed:', error);
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
      adjustment_amount: totals.adjustment_amount || 0,
      net_amount: totals.net_amount || 0,
      round_off: totals.round_off || 0,
      final_amount: totals.final_amount || 0
    };
  }
}

export default ReturnsCalculatorEnterprise;