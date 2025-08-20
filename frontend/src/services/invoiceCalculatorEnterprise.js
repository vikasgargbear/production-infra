/**
 * Enterprise Invoice Calculator Service
 * Single source of truth - all calculations via backend API with local fallback
 */

import { useState, useCallback } from 'react';
import api from './api';
import { buildUrl } from '../config/api.config';

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
      const response = await api.post('/calculations/invoice', {
        customer_id: invoiceData.customer_id,
        items: invoiceData.items.map(item => ({
          product_id: item.product_id,
          quantity: parseFloat(item.quantity || item.base_quantity) || 0,
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
        const { totals, lineItems } = this.calculateLocally(invoiceData);
        
        return {
          success: true,
          line_items: lineItems,
          totals: totals,
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
   * Calculate invoice item with proper free quantity business logic
   * @param {Object} item - Invoice item
   * @param {String} gstType - 'CGST/SGST' or 'IGST'
   * @returns {Object} Calculated values
   */
  static calculateItem(item, gstType = 'CGST/SGST') {
    // Parse quantities - handle different field names
    const totalQuantity = parseFloat(item.quantity || item.total_quantity) || 0;
    const freeQuantity = parseFloat(item.free_quantity) || 0;
    
    // CRITICAL BUSINESS LOGIC: base_quantity is what customer pays for
    // total_quantity = base_quantity + free_quantity (what customer receives)
    const baseQuantity = Math.max(0, totalQuantity - freeQuantity);
    
    const unitPrice = parseFloat(item.rate || item.sale_price || item.unit_price) || 0;
    const discountPercent = parseFloat(item.discount_percent) || 0;
    const gstPercent = parseFloat(item.gst_percent || item.tax_rate) || 12;

    // Base calculations - ONLY charge for base quantity (not free items)
    const subtotal = baseQuantity * unitPrice;
    const discountAmount = (subtotal * discountPercent) / 100;
    const taxableAmount = subtotal - discountAmount;
    const gstAmount = (taxableAmount * gstPercent) / 100;
    
    // Split GST based on type
    let cgstAmount = 0, sgstAmount = 0, igstAmount = 0;
    if (gstType === 'CGST/SGST') {
      cgstAmount = gstAmount / 2;
      sgstAmount = gstAmount / 2;
    } else {
      igstAmount = gstAmount;
    }
    
    const lineTotal = taxableAmount + gstAmount;

    return {
      // Original fields
      ...item,
      base_quantity: baseQuantity,
      total_quantity: totalQuantity,
      free_quantity: freeQuantity,
      
      // Calculated fields
      subtotal: this.round(subtotal),
      discount_amount: this.round(discountAmount),
      taxable_amount: this.round(taxableAmount),
      tax_amount: this.round(gstAmount),
      cgst_amount: this.round(cgstAmount),
      sgst_amount: this.round(sgstAmount),
      igst_amount: this.round(igstAmount),
      line_total: this.round(lineTotal),
      calculated_total: this.round(lineTotal), // For ItemsTable compatibility
      
      // Additional info
      effective_rate: baseQuantity > 0 ? this.round(lineTotal / totalQuantity) : 0 // Rate per total item received
    };
  }

  /**
   * Calculate locally using enterprise business logic
   * @param {Object} invoiceData - Invoice data with items
   * @returns {Object} Calculation results
   */
  static calculateLocally(invoiceData) {
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
      const calculatedItem = this.calculateItem(item, gstType);
      
      grossAmount += calculatedItem.subtotal;
      totalDiscount += calculatedItem.discount_amount;
      taxableAmount += calculatedItem.taxable_amount;
      totalTax += calculatedItem.tax_amount;
      cgstTotal += calculatedItem.cgst_amount;
      sgstTotal += calculatedItem.sgst_amount;
      igstTotal += calculatedItem.igst_amount;
      
      return calculatedItem;
    });
    
    // Add delivery charges to final amount
    const deliveryCharges = parseFloat(invoiceData.delivery_charges) || 0;
    const netAmount = taxableAmount + totalTax + deliveryCharges;
    const roundOff = Math.round(netAmount) - netAmount;
    const finalAmount = Math.round(netAmount);
    
    const totals = {
      gross_amount: this.round(grossAmount),
      total_discount: this.round(totalDiscount),
      taxable_amount: this.round(taxableAmount),
      total_tax: this.round(totalTax),
      cgst_amount: this.round(cgstTotal),
      sgst_amount: this.round(sgstTotal),
      igst_amount: this.round(igstTotal),
      delivery_charges: this.round(deliveryCharges),
      net_amount: finalAmount,
      round_off: this.round(roundOff),
      final_amount: finalAmount
    };
    
    return {
      totals,
      lineItems: calculatedLineItems
    };
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
    return {
      subtotal_amount: totals.taxable_amount || 0, // Frontend expects subtotal_amount
      discount_amount: totals.total_discount || 0,
      tax_amount: totals.total_tax || 0,
      net_amount: totals.final_amount || 0, // Frontend expects net_amount
      final_amount: totals.final_amount || 0,
      cgst_amount: totals.cgst_amount || 0,
      sgst_amount: totals.sgst_amount || 0,
      igst_amount: totals.igst_amount || 0,
      round_off: totals.round_off || 0,
      delivery_charges: totals.delivery_charges || 0,
      gross_amount: totals.gross_amount || 0
    };
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