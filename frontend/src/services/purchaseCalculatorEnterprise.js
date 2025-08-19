/**
 * Enterprise Purchase Calculator Service
 * Single source of truth - all calculations via backend API
 * Replaces all frontend purchase calculation logic
 */

import api from './api';

class PurchaseCalculatorEnterprise {
  /**
   * Calculate purchase totals via backend API
   * @param {Object} purchaseData - Purchase data with items
   * @returns {Promise<Object>} Complete calculation results
   */
  static async calculatePurchase(purchaseData) {
    try {
      const response = await api.post('/calculations/purchase', {
        supplier_id: purchaseData.supplier_id,
        items: purchaseData.items.map(item => ({
          product_id: item.product_id,
          quantity: parseFloat(item.quantity) || 0,
          purchase_price: parseFloat(item.purchase_price) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          gst_percent: parseFloat(item.gst_percent || item.tax_percent) || 12
        })),
        gst_type: purchaseData.gst_type || 'CGST/SGST',
        freight_charges: parseFloat(purchaseData.freight_charges) || 0,
        insurance_charges: parseFloat(purchaseData.insurance_charges) || 0,
        other_charges: parseFloat(purchaseData.other_charges) || 0,
        discount_amount: parseFloat(purchaseData.discount_amount) || 0
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
      console.error('Purchase calculation failed:', error);
      return {
        success: false,
        error: error.message,
        // Fallback totals to prevent UI crashes
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
          return_quantity: parseFloat(item.return_quantity) || 0,
          purchase_price: parseFloat(item.purchase_price) || 0,
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
      freight_charges: totals.freight_charges || 0,
      insurance_charges: totals.insurance_charges || 0,
      other_charges: totals.other_charges || 0,
      net_amount: totals.net_amount || 0,
      round_off: totals.round_off || 0,
      final_amount: totals.final_amount || 0
    };
  }

  /**
   * Debounced calculation for real-time updates
   * @param {Function} callback - Callback function to receive results
   * @param {number} delay - Debounce delay in milliseconds
   * @returns {Function} Debounced calculation function
   */
  static createDebouncedCalculator(callback, delay = 500) {
    let timeoutId;

    return (purchaseData) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        const result = await this.calculatePurchase(purchaseData);
        callback(result);
      }, delay);
    };
  }
}

export default PurchaseCalculatorEnterprise;