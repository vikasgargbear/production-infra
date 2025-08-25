/**
 * Enterprise Invoice Calculator Service
 * Single source of truth - all calculations via backend API with local fallback
 */

import { useState, useCallback } from 'react';
import api from './api';
import { getApiUrl } from '../config/api.config';
import EnterpriseCalculator from './enterpriseCalculator';
import OfflineCalculator from './offlineCalculator';

class InvoiceCalculatorEnterprise {
  static debounceTimeouts = new Map();
  
  /**
   * Calculate invoice totals using backend API
   * @param {Object} invoiceData - Invoice data with items
   * @returns {Promise<Object>} Complete calculation results
   */
  static async calculateInvoice(invoiceData) {
    try {
      // Use the existing backend calculation API
      const response = await api.post('/invoices/calculate', {
        customer_id: invoiceData.customer_id,
        items: invoiceData.items.map(item => ({
          product_id: item.product_id,
          quantity: parseFloat(item.quantity || item.base_quantity) || 0,
          base_quantity: parseFloat(item.base_quantity || item.quantity) || 0,
          free_quantity: parseFloat(item.free_quantity) || 0,
          unit_price: parseFloat(item.rate || item.sale_price || item.unit_price) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          gst_percent: parseFloat(item.gst_percent || item.tax_rate) || 12
        })),
        gst_type: invoiceData.gst_type || 'CGST/SGST',
        delivery_charges: parseFloat(invoiceData.delivery_charges) || 0,
        discount_amount: parseFloat(invoiceData.discount_amount) || 0
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
      console.error('Invoice calculation failed:', error);
      console.log('Falling back to local calculation...');
      
      // Fallback to local calculation if API fails
      try {
        const result = EnterpriseCalculator.calculateInvoice(invoiceData);
        
        // Local calc already has correct values, just log them
        console.log('Local fallback totals:', result.totals);
        
        return {
          success: true,
          line_items: result.items,
          totals: result.totals,
          timestamp: new Date().toISOString(),
          fallback: true
        };
      } catch (localError) {
        console.error('Local calculation also failed:', localError);
        
        return {
          success: false,
          error: 'Both API and local calculations failed',
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
   * Calculate locally - delegates to EnterpriseCalculator
   * @param {Object} invoiceData - Invoice data with items
   * @returns {Object} Complete calculation results
   */
  static calculateLocally(invoiceData) {
    return EnterpriseCalculator.calculateInvoice(invoiceData);
  }
  
  /**
   * DEPRECATED - Use EnterpriseCalculator directly
   */
  static _calculateLocallyOld(invoiceData) {
    const items = invoiceData.items || [];
    const gstType = invoiceData.gst_type || 'CGST/SGST';
    
    let grossAmount = 0;
    let totalDiscount = 0;
    let taxableAmount = 0;
    let totalTax = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;
    
    const calculatedLineItems = items.map(item => {
      // Parse all values once
      const quantity = parseFloat(item.quantity) || 0;
      const freeQuantity = parseFloat(item.free_quantity) || 0;
      const rate = parseFloat(item.sale_price || item.rate || item.selling_price) || 0;
      const discountPercent = parseFloat(item.discount_percent) || 0;
      const gstPercent = parseFloat(item.gst_percent || item.tax_rate) || 12;
      
      // Business logic: base_quantity is what customer pays for
      const baseQuantity = parseFloat(item.base_quantity || item.baseQuantity || quantity);
      const totalQuantity = baseQuantity + freeQuantity;
      
      // Calculate amounts on base quantity only
      const subtotal = rate * baseQuantity;
      const discountAmount = (subtotal * discountPercent) / 100;
      const taxableAmt = subtotal - discountAmount;
      const gstAmount = (taxableAmt * gstPercent) / 100;
      const cgstAmt = gstType === 'CGST/SGST' ? gstAmount / 2 : 0;
      const sgstAmt = gstType === 'CGST/SGST' ? gstAmount / 2 : 0;
      const igstAmt = gstType === 'IGST' ? gstAmount : 0;
      const totalAmount = taxableAmt + gstAmount;
      
      // Accumulate totals
      grossAmount += subtotal;
      totalDiscount += discountAmount;
      taxableAmount += taxableAmt;
      totalTax += gstAmount;
      cgstTotal += cgstAmt;
      sgstTotal += sgstAmt;
      igstTotal += igstAmt;
      
      // Return calculated item with all necessary fields
      return {
        ...item,
        // Core calculations
        subtotal: this.round(subtotal),
        discount_amount: this.round(discountAmount),
        taxable_amount: this.round(taxableAmt),
        tax_amount: this.round(gstAmount),
        cgst_amount: this.round(cgstAmt),
        sgst_amount: this.round(sgstAmt),
        igst_amount: this.round(igstAmt),
        line_total: this.round(totalAmount),
        calculated_total: this.round(totalAmount),
        
        // Quantity fields
        base_quantity: baseQuantity,
        free_quantity: freeQuantity,
        total_quantity: totalQuantity,
        
        // Legacy field support
        discountAmount: this.round(discountAmount),
        taxableAmount: this.round(taxableAmt),
        gstAmount: this.round(gstAmount),
        totalAmount: this.round(totalAmount),
        cgst: this.round(cgstAmt),
        sgst: this.round(sgstAmt),
        igst: this.round(igstAmt)
      };
    });
    
    // Calculate final totals
    const deliveryCharges = parseFloat(invoiceData.delivery_charges) || 0;
    const netAmount = taxableAmount + totalTax + deliveryCharges;
    const roundOff = parseFloat((Math.round(netAmount) - netAmount).toFixed(2));
    const finalAmount = Math.round(netAmount);
    
    return {
      totals: {
        gross_amount: this.round(grossAmount),
        total_discount: this.round(totalDiscount),
        taxable_amount: this.round(taxableAmount),
        total_tax: this.round(totalTax),
        cgst_amount: this.round(cgstTotal),
        sgst_amount: this.round(sgstTotal),
        igst_amount: this.round(igstTotal),
        delivery_charges: this.round(deliveryCharges),
        net_amount: this.round(netAmount),
        round_off: this.round(roundOff),
        final_amount: finalAmount,
        
        // Legacy field support
        subtotal_amount: this.round(taxableAmount),
        discount_amount: this.round(totalDiscount),
        tax_amount: this.round(totalTax)
      },
      lineItems: calculatedLineItems
    };
  }
  
  /**
   * Calculate single item - delegates to EnterpriseCalculator
   * @param {Object} item - Invoice item
   * @param {String} gstType - 'CGST/SGST' or 'IGST'
   * @returns {Object} Calculated values
   */
  static calculateItem(item, gstType = 'CGST/SGST') {
    return EnterpriseCalculator.calculateItem(item, { gst_type: gstType });
  }

  /**
   * Round to specified decimal places
   * @param {Number} value 
   * @param {Number} decimals
   * @returns {Number}
   */
  static round(value, decimals = 2) {
    return Math.round((value + Number.EPSILON) * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  /**
   * Format totals for frontend display
   * @param {Object} totals - Raw totals from backend calculation API
   * @returns {Object} Formatted totals for invoice component
   */
  static formatTotalsForDisplay(totals) {
    // Simply pass through the values from backend without modifying
    const formatted = {
      subtotal_amount: totals.taxable_amount || 0,
      taxable_amount: totals.taxable_amount || 0,
      discount_amount: totals.total_discount || 0,
      tax_amount: totals.total_tax || totals.tax_amount || 0,
      delivery_charges: totals.delivery_charges || 0,
      invoice_discount: totals.invoice_discount || 0,
      cgst_amount: totals.cgst_amount || 0,
      sgst_amount: totals.sgst_amount || 0,
      igst_amount: totals.igst_amount || 0,
      round_off: parseFloat((totals.round_off || 0).toFixed(2)),
      // Don't set net_amount or final_amount - let components calculate them
      gross_amount: totals.gross_amount || 0
    };
    
    console.log('Totals from backend:', totals);
    console.log('Formatted for display:', formatted);
    
    return formatted;
  }
  
  /**
   * Debounced calculation for real-time updates with instant local feedback
   * Shows local calculation immediately, then updates with backend result
   */
  static calculateDebounced(invoiceData, callback, delay = 500) {
    const key = 'invoice_calc';
    
    // INSTANT: Calculate locally first for immediate UI feedback
    try {
      const localResult = EnterpriseCalculator.calculateInvoice(invoiceData);
      callback(null, {
        success: true,
        line_items: localResult.items,
        totals: localResult.totals,
        timestamp: new Date().toISOString(),
        isLocal: true // Flag to indicate this is local calculation
      });
    } catch (localError) {
      console.error('Local calculation failed:', localError);
    }
    
    // Clear previous backend call timeout
    if (this.debounceTimeouts.has(key)) {
      clearTimeout(this.debounceTimeouts.get(key));
    }
    
    // Set new timeout for backend calculation
    const timeoutId = setTimeout(async () => {
      try {
        const result = await this.calculateInvoice(invoiceData);
        // Update with backend result (source of truth)
        callback(null, result);
      } catch (error) {
        // If backend fails, keep using local calculation
        console.error('Backend calculation failed, using local:', error);
      }
      this.debounceTimeouts.delete(key);
    }, delay);
    
    this.debounceTimeouts.set(key, timeoutId);
  }
  
  /**
   * Instant calculation for immediate UI updates (no debounce)
   * Uses offline-first approach like SAP/Oracle
   */
  static calculateInstant(invoiceData) {
    // Always use OfflineCalculator for instant results
    return OfflineCalculator.calculate(invoiceData);
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
      const response = await fetch(getApiUrl('/invoices/calculate/batch'), {
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