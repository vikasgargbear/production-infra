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
   * Generate Invoice Number
   */
  async generateInvoiceNumber() {
    try {
      const response = await apiClient.get('/invoices/generate-number');
      if (response?.data?.invoice_number) {
        return response.data.invoice_number;
      }
    } catch (error) {
      console.warn('Backend invoice number generation failed:', error);
    }
    
    // Fallback to client-side generation
    const timestamp = Date.now();
    return `INV-${timestamp.toString().slice(-8)}`;
  }

  /**
   * Generate Purchase Number (for direct purchase entry, not PO)
   */
  async generatePurchaseNumber() {
    const response = await safeApiCall(() => apiClient.get('/purchases/generate-number'));
    if (response?.data?.purchase_number) {
      return response.data.purchase_number;
    }
    
    // Fallback to client-side generation with PURCH prefix for Purchase Entry
    const timestamp = Date.now();
    const year = new Date().getFullYear().toString().slice(-2);
    return `PURCH-${year}${timestamp.toString().slice(-8)}`;
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
    
    // Fallback to client-side generation
    const timestamp = Date.now();
    const year = new Date().getFullYear();
    return `PO-${year}-${timestamp.toString().slice(-6)}`;
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
    
    // Fallback to client-side generation
    const timestamp = Date.now();
    const year = new Date().getFullYear();
    return `GRN-${year}-${timestamp.toString().slice(-6)}`;
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
    
    // Fallback to client-side generation
    const timestamp = Date.now();
    const year = new Date().getFullYear() % 100;
    return `DC-${year.toString().padStart(2, '0')}${timestamp.toString().slice(-6)}`;
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
    
    // Fallback to client-side generation
    const timestamp = Date.now();
    const year = new Date().getFullYear();
    return `SO-${year}-${timestamp.toString().slice(-6)}`;
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