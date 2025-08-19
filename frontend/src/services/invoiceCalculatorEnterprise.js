/**
 * Enterprise Invoice Calculator Service - API-Only Version
 * Replaces all frontend calculations with backend API calls
 */

import { buildUrl } from '../config/api.config';
import { useState, useCallback } from 'react';

class InvoiceCalculatorEnterprise {
  static debounceTimeouts = new Map();
  
  /**
   * Main calculation method - calls backend API
   * @param {Object} invoiceData - Complete invoice data
   * @returns {Promise<Object>} Calculated totals and line items
   */
  static async calculateInvoice(invoiceData) {
    try {
      const response = await fetch(buildUrl('/invoices/calculate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(invoiceData)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error('Calculation failed on backend');
      }
      
      return result;
    } catch (error) {
      console.error('Invoice calculation API error:', error);
      throw new Error(`Calculation failed: ${error.message}`);
    }
  }
  
  /**
   * Debounced calculation for real-time updates
   * Prevents excessive API calls during rapid typing
   */
  static calculateDebounced(invoiceData, callback, delay = 500) {
    const key = 'invoice_calc';
    
    // Clear previous timeout
    if (this.debounceTimeouts.has(key)) {
      clearTimeout(this.debounceTimeouts.get(key));
    }
    
    // Set new timeout
    const timeoutId = setTimeout(async () => {
      try {
        const result = await this.calculateInvoice(invoiceData);
        callback(null, result);
      } catch (error) {
        callback(error, null);
      }
      this.debounceTimeouts.delete(key);
    }, delay);
    
    this.debounceTimeouts.set(key, timeoutId);
  }
  
  /**
   * Get calculation hook for React components
   * Note: This returns a function that creates a hook
   */
  static getCalculationHook() {
    return function useInvoiceCalculation() {
      const [totals, setTotals] = useState(null);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);
      
      const calculate = useCallback((invoiceData) => {
        setLoading(true);
        setError(null);
        
        InvoiceCalculatorEnterprise.calculateDebounced(invoiceData, (err, result) => {
          setLoading(false);
          if (err) {
            setError(err.message);
          } else {
            setTotals(result);
          }
        });
      }, []);
      
      return { totals, loading, error, calculate };
    };
  }
  
  /**
   * Optimistic update pattern for better UX
   * Shows previous values while calculating new ones
   */
  static async calculateWithOptimisticUpdate(invoiceData, currentTotals, setTotals, setLoading) {
    try {
      // Don't show loading if we have current totals (prevents UI flicker)
      if (!currentTotals) {
        setLoading(true);
      }
      
      const result = await this.calculateInvoice(invoiceData);
      
      setTotals(result);
      setLoading(false);
      
      return result;
    } catch (error) {
      setLoading(false);
      
      // Keep current totals on error (don't break UI)
      console.error('Calculation failed, keeping current totals:', error);
      throw error;
    }
  }
  
  /**
   * Batch calculation for multiple invoices
   */
  static async calculateBatch(invoices) {
    try {
      const response = await fetch(buildUrl('/invoices/calculate/batch'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ invoices })
      });
      
      if (!response.ok) {
        throw new Error(`Batch calculation failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Batch calculation error:', error);
      throw error;
    }
  }
  
  /**
   * Currency formatting - frontend only handles display
   */
  static formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  }
  
  /**
   * Extract totals for backward compatibility
   */
  static extractTotals(calculationResult) {
    if (!calculationResult || !calculationResult.totals) {
      return {
        subtotal: 0,
        totalDiscount: 0,
        taxableAmount: 0,
        gstAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        netAmount: 0,
        roundOff: 0,
        finalAmount: 0
      };
    }
    
    const { totals } = calculationResult;
    
    return {
      subtotal: totals.gross_amount,
      totalDiscount: totals.total_discount,
      taxableAmount: totals.taxable_amount,
      gstAmount: totals.total_tax,
      cgstAmount: totals.cgst_amount,
      sgstAmount: totals.sgst_amount,
      igstAmount: totals.igst_amount,
      netAmount: totals.net_amount,
      roundOff: totals.round_off,
      finalAmount: totals.final_amount
    };
  }
  
  /**
   * Validate invoice data before sending to API
   */
  static validateInvoiceData(invoiceData) {
    const errors = [];
    
    if (!invoiceData.items || !Array.isArray(invoiceData.items)) {
      errors.push('Items array is required');
    }
    
    if (invoiceData.items && invoiceData.items.length === 0) {
      errors.push('At least one item is required');
    }
    
    invoiceData.items?.forEach((item, index) => {
      if (!item.unit_price || isNaN(parseFloat(item.unit_price))) {
        errors.push(`Item ${index + 1}: Valid unit_price is required`);
      }
      
      if (!item.quantity || isNaN(parseFloat(item.quantity))) {
        errors.push(`Item ${index + 1}: Valid quantity is required`);
      }
    });
    
    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
    
    return true;
  }
}

export default InvoiceCalculatorEnterprise;