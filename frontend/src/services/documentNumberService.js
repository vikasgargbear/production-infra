/**
 * Document Number Generation Service
 * Provides consistent document number generation across all modules
 */

import { apiClient } from './api';

// Wrapper to safely handle API calls without throwing uncaught errors
const safeApiCall = async (apiCall) => {
  try {
    return await apiCall();
  } catch (error) {
    // Return null to trigger fallback, don't re-throw
    return null;
  }
};

class DocumentNumberService {
  
  /**
   * Generate Invoice Number - ALWAYS from backend to prevent duplicates
   */
  async generateInvoiceNumber() {
    let retries = 3;
    let lastError = null;
    
    while (retries > 0) {
      try {
        const response = await apiClient.get('/invoices/generate-number');
        if (response?.data?.invoice_number) {
          return response.data.invoice_number;
        }
        throw new Error('Invalid response format');
      } catch (error) {
        lastError = error;
        retries--;
        if (retries > 0) {
          console.warn(`Invoice number generation failed, retrying... (${retries} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
      }
    }
    
    console.error('Failed to generate invoice number after 3 attempts:', lastError);
    // Return a temporary placeholder - the user should retry
    return 'INV-TEMP-' + Date.now().toString().slice(-6);
  }

  /**
   * Generate Purchase Number (for direct purchase entry, not PO)
   */
  async generatePurchaseNumber() {
    const response = await safeApiCall(() => apiClient.get('/purchases/generate-number'));
    if (response?.data?.purchase_number) {
      return response.data.purchase_number;
    }
    
    // Fallback to client-side generation matching backend format
    // Format: PUR-YY######## (year prefix + 8-digit number)
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `PUR-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate Purchase Order Number
   */
  async generatePurchaseOrderNumber() {
    try {
      // Fixed: Use correct endpoint path
      const response = await apiClient.get('/purchases/generate-number');
      if (response?.data?.po_number) {
        return response.data.po_number;
      }
    } catch (error) {
      // Only log non-404 errors once
      if (error?.response?.status !== 404) {
        console.warn('Purchase order number generation error:', error.message);
      }
    }
    
    // Fallback to client-side generation matching backend format
    // Format: PO-YY######## (year prefix + 8-digit number)
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `PO-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate PO Number (alias for generatePurchaseOrderNumber)
   */
  async generatePONumber() {
    return this.generatePurchaseOrderNumber();
  }

  /**
   * Generate GRN Number
   */
  async generateGRNNumber() {
    try {
      const response = await apiClient.get('/grn/generate-number');
      if (response?.data?.grn_number) {
        return response.data.grn_number;
      }
    } catch (error) {
      console.warn('Backend GRN number generation failed:', error);
    }
    
    // Fallback to client-side generation matching backend format
    // Format: GRN-YY######## (year prefix + 8-digit number)
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `GRN-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate Return Number (for generic returns)
   */
  async generateReturnNumber() {
    try {
      const response = await apiClient.get('/sale-returns/generate-number');
      if (response?.data?.return_number) {
        return response.data.return_number;
      }
    } catch (error) {
      console.warn('Backend return number generation failed:', error);
    }
    
    // Fallback to client-side generation
    const timestamp = Date.now();
    const year = new Date().getFullYear() % 100;
    return `SRN-${year.toString().padStart(2, '0')}${timestamp.toString().slice(-6)}`;
  }

  /**
   * Generate Sales Return Number
   */
  async generateSalesReturnNumber() {
    try {
      const response = await apiClient.get('/sale-returns/generate-number');
      if (response?.data?.return_number) {
        return response.data.return_number;
      }
    } catch (error) {
      console.warn('Backend sales return number generation failed:', error);
    }
    
    // Fallback to client-side generation
    const timestamp = Date.now();
    const year = new Date().getFullYear() % 100;
    return `SRN-${year.toString().padStart(2, '0')}${timestamp.toString().slice(-6)}`;
  }

  /**
   * Generate Challan Number
   */
  async generateChallanNumber() {
    try {
      const response = await apiClient.get('/delivery-challan/generate-number');
      if (response?.data?.challan_number) {
        return response.data.challan_number;
      }
    } catch (error) {
      console.warn('Backend challan number generation failed:', error);
    }
    
    // Fallback to client-side generation matching backend format
    // Format: DC-YY######## (year prefix + 8-digit number)
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `DC-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate Sales Order Number
   */
  async generateSalesOrderNumber() {
    try {
      const response = await apiClient.get('/sales-orders/generate-number');
      if (response?.data?.order_number) {
        return response.data.order_number;
      }
    } catch (error) {
      console.warn('Backend sales order number generation failed:', error);
    }
    
    // Fallback to client-side generation matching backend format
    // Format: SO-YY######## (year prefix + 8-digit number)
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `SO-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generic document number generator
   * @param {string} type - Document type (invoice, purchase, etc.)
   * @param {string} prefix - Prefix for the number (INV, PUR, etc.)
   */
  generateFallbackNumber(type, prefix) {
    const timestamp = Date.now();
    const year = new Date().getFullYear();
    
    switch (type) {
      case 'invoice':
        return `${prefix}-${timestamp.toString().slice(-8)}`;
      default:
        return `${prefix}-${year}-${timestamp.toString().slice(-6)}`;
    }
  }
}

// Export singleton instance
export default new DocumentNumberService();