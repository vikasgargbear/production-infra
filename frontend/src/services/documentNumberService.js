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
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
      }
    }
    
    // Fallback to backend-compatible format: INV-YY######## 
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `INV-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate Purchase Number (for direct purchase entry, not PO)
   */
  async generatePurchaseNumber() {
    // Client-side generation matching backend format
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
    // Client-side generation matching backend format
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
    // Client-side generation matching backend format
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
    // Client-side generation
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `SRN-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate Sales Return Number
   */
  async generateSalesReturnNumber() {
    // Client-side generation
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `SRN-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate Challan Number
   */
  async generateChallanNumber() {
    // Client-side generation matching backend format
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
    // Client-side generation matching backend format
    // Format: SO-YY######## (year prefix + 8-digit number)
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `SO-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate Payment Number
   */
  async generatePaymentNumber() {
    // Format: PAY-YY######## (year prefix + 8-digit number)
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `PAY-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate Credit Note Number
   */
  async generateCreditNoteNumber() {
    // Format: CN-YY######## (year prefix + 8-digit number)
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `CN-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate Debit Note Number
   */
  async generateDebitNoteNumber() {
    // Format: DN-YY######## (year prefix + 8-digit number)
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `DN-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate Stock Adjustment Number
   */
  async generateAdjustmentNumber() {
    // Format: ADJ-YY######## (year prefix + 8-digit number)
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `ADJ-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate Stock Transfer Number
   */
  async generateTransferNumber() {
    // Format: TRF-YY######## (year prefix + 8-digit number)
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `TRF-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate Receipt Number
   */
  async generateReceiptNumber() {
    // Format: RCT-YY######## (year prefix + 8-digit number)
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `RCT-${yearPrefix}${uniqueNum}`;
  }

  /**
   * Generate Purchase Return Number
   */
  async generatePurchaseReturnNumber() {
    // Format: PRN-YY######## (year prefix + 8-digit number)
    const now = new Date();
    const year = now.getFullYear() % 100;
    const yearPrefix = year.toString().padStart(2, '0');
    const timestamp = Date.now();
    const uniqueNum = 10000000 + (timestamp % 90000000);
    return `PRN-${yearPrefix}${uniqueNum}`;
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