import api, { ordersApi, invoicesApi } from './api';

/**
 * Invoice Service - Handles invoice generation workflow
 */
export const invoiceService = {
  /**
   * Create a quick sale (order + invoice in one transaction)
   * @param {Object} saleData - Sale data including customer, items, payment
   * @returns {Promise<Object>} Order and invoice details
   */
  async createQuickSale(saleData) {
    try {
      const response = await api.post('/quick-sale/', saleData);
      return response.data;
    } catch (error) {
      console.error('Quick sale failed:', error);
      throw error;
    }
  },

  /**
   * Complete invoice generation flow (DEPRECATED - use createQuickSale instead)
   * @param {number} orderId - The order ID to generate invoice for
   * @returns {Promise<Object>} Invoice details for PDF generation
   */
  async generateInvoiceForOrder(orderId) {
    try {
      // Step 1: Confirm the order
      await ordersApi.confirm(orderId);
      
      // Step 2: Generate invoice
      const invoiceResponse = await ordersApi.generateInvoice(orderId, {
        invoice_date: new Date().toISOString().split('T')[0]
      });
      
      // Step 3: Get invoice details for PDF
      const detailsResponse = await invoicesApi.getDetails(invoiceResponse.data.invoice_id);
      
      return detailsResponse.data;
    } catch (error) {
      console.error('Invoice generation failed:', error);
      throw error;
    }
  },

  /**
   * Get invoice details by invoice ID
   * @param {number} invoiceId - The invoice ID
   * @returns {Promise<Object>} Invoice details
   */
  async getInvoiceDetails(invoiceId) {
    try {
      const response = await invoicesApi.getDetails(invoiceId);
      return response.data;
    } catch (error) {
      console.error('Failed to get invoice details:', error);
      throw error;
    }
  },

  /**
   * Update invoice with PDF URL after generation
   * @param {number} invoiceId - The invoice ID
   * @param {string} pdfUrl - The URL of the generated PDF
   */
  async updatePdfUrl(invoiceId, pdfUrl) {
    try {
      await invoicesApi.updatePdfUrl(invoiceId, pdfUrl);
    } catch (error) {
      console.error('Failed to update PDF URL:', error);
      throw error;
    }
  },

  /**
   * Record a payment for an invoice
   * @param {number} invoiceId - The invoice ID
   * @param {Object} paymentData - Payment details
   */
  async recordPayment(invoiceId, paymentData) {
    try {
      const response = await invoicesApi.recordPayment(invoiceId, paymentData);
      return response.data;
    } catch (error) {
      console.error('Failed to record payment:', error);
      throw error;
    }
  },

  /**
   * Format invoice details for display
   * @param {Object} invoice - Raw invoice data
   * @returns {Object} Formatted invoice data
   */
  formatInvoiceData(invoice) {
    return {
      ...invoice,
      formattedDate: new Date(invoice.invoice_date).toLocaleDateString('en-IN'),
      formattedDueDate: new Date(invoice.due_date).toLocaleDateString('en-IN'),
      formattedTotal: `₹${parseFloat(invoice.total_amount).toFixed(2)}`,
      formattedBalance: `₹${parseFloat(invoice.balance_amount).toFixed(2)}`,
      taxBreakdown: {
        cgst: `₹${parseFloat(invoice.cgst_amount).toFixed(2)}`,
        sgst: `₹${parseFloat(invoice.sgst_amount).toFixed(2)}`,
        igst: `₹${parseFloat(invoice.igst_amount).toFixed(2)}`,
        total: `₹${parseFloat(invoice.total_tax_amount).toFixed(2)}`
      }
    };
  },

  /**
   * Generate invoice number format
   * @param {string} invoiceNumber - Raw invoice number
   * @returns {string} Formatted invoice number
   */
  formatInvoiceNumber(invoiceNumber) {
    return invoiceNumber; // Already formatted as INV-YYYY-MM-00001
  },

  /**
   * Check if order is eligible for invoice generation
   * @param {Object} order - Order object
   * @returns {boolean} True if eligible
   */
  isOrderEligibleForInvoice(order) {
    const eligibleStatuses = ['confirmed', 'processing', 'packed', 'shipped', 'delivered'];
    return eligibleStatuses.includes(order.order_status);
  },

  /**
   * Get invoice by order ID
   * @param {number} orderId - Order ID
   * @returns {Promise<Object|null>} Invoice if exists, null otherwise
   */
  async getInvoiceByOrderId(orderId) {
    try {
      const invoicesResponse = await invoicesApi.getAll();
      const invoices = invoicesResponse.data || [];
      return invoices.find(inv => inv.order_id === orderId) || null;
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
      return null;
    }
  }
};

export default invoiceService;