/**
 * Enterprise Invoice Calculator Service
 * Single API-driven calculation approach like SAP/Oracle
 * Frontend displays backend-calculated values only
 */

class EnterpriseInvoiceCalculator {
  
  /**
   * Calculate invoice totals via backend API
   * This is the ONLY calculation method - frontend never calculates
   */
  static async calculateInvoice(invoiceData) {
    try {
      const response = await fetch('/api/invoices/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoiceData)
      });
      
      if (!response.ok) {
        throw new Error(`Calculation failed: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Invoice calculation error:', error);
      throw error;
    }
  }
  
  /**
   * Debounced calculation for real-time updates
   * Prevents excessive API calls during rapid item entry
   */
  static createDebouncedCalculator(delay = 300) {
    let timeoutId;
    
    return (invoiceData, callback) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        try {
          const result = await this.calculateInvoice(invoiceData);
          callback(null, result);
        } catch (error) {
          callback(error, null);
        }
      }, delay);
    };
  }
  
  /**
   * Display-only formatter for currency
   * Frontend only formats, never calculates
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
   * Optimistic UI update pattern
   * Show calculated values immediately while API processes
   */
  static async calculateWithOptimisticUpdate(invoiceData, setTotals) {
    // 1. Keep current totals visible (no flicker)
    
    // 2. Send to backend for calculation
    try {
      const calculated = await this.calculateInvoice(invoiceData);
      
      // 3. Update with authoritative backend values
      setTotals(calculated);
      
      return calculated;
    } catch (error) {
      // 4. Handle error without breaking UI
      console.error('Calculation failed, keeping current values:', error);
      throw error;
    }
  }
  
  /**
   * Batch calculation for multiple invoices
   * Enterprise feature for bulk processing
   */
  static async calculateBatch(invoices) {
    try {
      const response = await fetch('/api/invoices/calculate/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoices })
      });
      
      return await response.json();
    } catch (error) {
      console.error('Batch calculation error:', error);
      throw error;
    }
  }
}

export default EnterpriseInvoiceCalculator;