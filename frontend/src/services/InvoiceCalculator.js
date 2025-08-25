/**
 * Unified Invoice Calculator
 * Single source of truth for all invoice calculations
 * Supports both offline (instant) and online (validated) modes
 */

import EnterpriseCalculator from './enterpriseCalculator';

class InvoiceCalculator {
  /**
   * Instant calculation - no network, pure math
   * Used for real-time UI updates
   */
  static calculate(invoiceData) {
    return EnterpriseCalculator.calculateInvoice(invoiceData);
  }

  /**
   * Calculate with backend validation
   * Used only on save/submit for compliance
   */
  static async calculateWithBackend(invoiceData) {
    try {
      const response = await fetch('/api/invoices/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: invoiceData.customer_id,
          items: invoiceData.items.map(item => ({
            product_id: item.product_id,
            quantity: parseFloat(item.quantity) || 0,
            free_quantity: parseFloat(item.free_quantity) || 0,
            unit_price: parseFloat(item.rate || item.sale_price) || 0,
            discount_percent: parseFloat(item.discount_percent) || 0,
            gst_percent: parseFloat(item.gst_percent) || 12
          })),
          delivery_charges: parseFloat(invoiceData.delivery_charges) || 0,
          discount_amount: parseFloat(invoiceData.discount_amount) || 0
        })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          ...data,
          source: 'backend'
        };
      }
    } catch (error) {
      console.log('Backend calculation failed, using local:', error);
    }

    // Fallback to local calculation
    const localResult = this.calculate(invoiceData);
    return {
      success: true,
      ...localResult,
      source: 'local'
    };
  }

  /**
   * Smart calculation - instant local + optional backend sync
   * This is what components should use
   */
  static async calculateSmart(invoiceData, options = {}) {
    const { validateWithBackend = false } = options;
    
    // Always calculate locally first for instant feedback
    const localResult = this.calculate(invoiceData);
    
    // If validation requested, also check with backend
    if (validateWithBackend) {
      return this.calculateWithBackend(invoiceData);
    }
    
    return localResult;
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

// Also export specific calculators for backward compatibility
export const calculateInvoice = InvoiceCalculator.calculate;
export const calculateWithValidation = InvoiceCalculator.calculateWithBackend;

export default InvoiceCalculator;