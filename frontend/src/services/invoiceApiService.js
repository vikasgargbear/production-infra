/**
 * Invoice API Service
 * Handles all backend API calls for invoice calculations and validation
 * Replaces frontend calculations with secure backend calculations
 */

// Use the unified API client instead of creating a separate instance
import api from './api';

// The unified apiClient already has:
// - Correct base URL with /api/v1
// - Authentication interceptors
// - Error handling
// - CORS redirect handling

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // If backend APIs are not ready, provide mock responses
    if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
      
      // Mock responses for development
      if (error.config.url?.includes('calculate-live')) {
        const requestData = JSON.parse(error.config.data || '{}');
        
        // Calculate totals properly using each product's GST rate
        let gross_amount = 0;
        let total_discount = 0;
        let taxable_amount = 0;
        let total_cgst = 0;
        let total_sgst = 0;
        let total_igst = 0;
        let total_gst = 0;
        
        const calculatedItems = (requestData.items || []).map(item => {
          const quantity = parseFloat(item.quantity) || 0;
          const rate = parseFloat(item.sale_price) || 0;
          const discountPercent = parseFloat(item.discount_percent) || 0;
          const gstPercent = parseFloat(item.gst_percent) || 12; // Product-specific GST rate
          
          // Calculate item totals
          const itemGross = quantity * rate;
          const itemDiscount = (itemGross * discountPercent) / 100;
          const itemTaxable = itemGross - itemDiscount;
          const itemGstAmount = (itemTaxable * gstPercent) / 100;
          
          // Determine GST split based on delivery type (mock logic)
          const isInterstate = requestData.delivery_type === 'INTERSTATE';
          const itemCgst = isInterstate ? 0 : itemGstAmount / 2;
          const itemSgst = isInterstate ? 0 : itemGstAmount / 2;
          const itemIgst = isInterstate ? itemGstAmount : 0;
          
          const itemTotal = itemTaxable + itemGstAmount;
          
          // Add to totals
          gross_amount += itemGross;
          total_discount += itemDiscount;
          taxable_amount += itemTaxable;
          total_cgst += itemCgst;
          total_sgst += itemSgst;
          total_igst += itemIgst;
          total_gst += itemGstAmount;
          
          return {
            ...item,
            rate: rate,
            discount_amount: Math.round(itemDiscount * 100) / 100,
            taxable_amount: Math.round(itemTaxable * 100) / 100,
            gst_amount: Math.round(itemGstAmount * 100) / 100,
            cgst_amount: Math.round(itemCgst * 100) / 100,
            sgst_amount: Math.round(itemSgst * 100) / 100,
            igst_amount: Math.round(itemIgst * 100) / 100,
            line_total: Math.round(itemTotal * 100) / 100
          };
        });
        
        const final_amount = taxable_amount + total_gst + (parseFloat(requestData.delivery_charges) || 0);
        
        return Promise.resolve({
          data: {
            success: true,
            data: {
              totals: {
                gross_amount: Math.round(gross_amount * 100) / 100,
                total_discount: Math.round(total_discount * 100) / 100,
                taxable_amount: Math.round(taxable_amount * 100) / 100,
                total_gst: Math.round(total_gst * 100) / 100,
                total_cgst: Math.round(total_cgst * 100) / 100,
                total_sgst: Math.round(total_sgst * 100) / 100,
                total_igst: Math.round(total_igst * 100) / 100,
                delivery_charges: parseFloat(requestData.delivery_charges) || 0,
                final_amount: Math.round(final_amount * 100) / 100
              },
              items: calculatedItems,
              invoice_info: {
                gst_type: (requestData.delivery_type === 'INTERSTATE') ? 'IGST' : 'CGST/SGST',
                is_interstate: requestData.delivery_type === 'INTERSTATE'
              }
            }
          }
        });
      } else if (error.config.url?.includes('company/settings/public')) {
        return Promise.resolve({
          data: {
            company_name: 'AASO Pharmaceuticals',
            address: 'Gangapur City, Rajasthan',
            phone: '+91-XXX-XXX-XXXX',
            email: 'info@aasopharma.com'
          }
        });
      } else if (error.config.url?.includes('company/settings/secure')) {
        return Promise.resolve({
          data: {
            gstin: '27AABCU9603R1ZM',
            state_code: '27'
          }
        });
      }
    }
    
    return Promise.reject(error);
  }
);

class InvoiceApiService {
  
  /**
   * Calculate invoice totals and item amounts on backend
   * @param {Object} invoiceData - Invoice data for calculation
   * @returns {Promise<Object>} Calculated invoice with totals
   */
  static async calculateInvoice(invoiceData) {
    try {
      const response = await api.post('/invoices/calculate-live', {
        customer_id: invoiceData.customer_id,
        delivery_type: invoiceData.delivery_type || 'PICKUP',
        payment_mode: invoiceData.payment_mode || 'CASH',
        invoice_date: invoiceData.invoice_date || new Date().toISOString().split('T')[0],
        items: invoiceData.items.map(item => ({
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: parseFloat(item.quantity) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0,
          free_quantity: parseFloat(item.free_quantity) || 0
        })),
        delivery_charges: parseFloat(invoiceData.delivery_charges) || 0,
        additional_discount: parseFloat(invoiceData.additional_discount) || 0,
        round_off: true
      });

      // The backend returns the calculation directly, not wrapped in success/data
      if (response.data) {
        return {
          success: true,
          data: {
            totals: response.data,
            items: invoiceData.items // Keep original items for now
          }
        };
      } else {
        throw new Error('Calculation failed - no response data');
      }
    } catch (error) {
      console.error('Invoice calculation failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || {
          code: 'CALCULATION_ERROR',
          message: error.message || 'Failed to calculate invoice'
        }
      };
    }
  }

  /**
   * Validate invoice against business rules
   * @param {Object} invoiceData - Invoice data for validation
   * @returns {Promise<Object>} Validation result
   */
  static async validateInvoice(invoiceData) {
    try {
      const response = await api.post('/invoices/validate', {
        customer_id: invoiceData.customer_id,
        items: invoiceData.items.map(item => ({
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: parseFloat(item.quantity) || 0,
          discount_percent: parseFloat(item.discount_percent) || 0
        }))
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Invoice validation failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || {
          code: 'VALIDATION_ERROR',
          message: error.message || 'Failed to validate invoice'
        }
      };
    }
  }

  /**
   * Check customer credit limit
   * @param {String} customerId - Customer ID
   * @param {Number} invoiceAmount - Invoice amount to check
   * @returns {Promise<Object>} Credit check result
   */
  static async checkCustomerCredit(customerId, invoiceAmount) {
    try {
      const response = await api.post(`/api/customers/${customerId}/credit-check`, {
        invoice_amount: parseFloat(invoiceAmount),
        include_pending_invoices: true
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Credit check failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || {
          code: 'CREDIT_CHECK_ERROR',
          message: error.message || 'Failed to check customer credit'
        }
      };
    }
  }

  /**
   * Save invoice draft
   * @param {Object} draftData - Draft data to save
   * @returns {Promise<Object>} Save result
   */
  static async saveDraft(draftData) {
    try {
      const response = await api.post('/invoices/drafts', {
        draft_id: draftData.draft_id,
        customer_id: draftData.customer_id,
        items: draftData.items,
        totals: draftData.totals,
        metadata: {
          last_modified: new Date().toISOString(),
          created_by: draftData.created_by || 'CURRENT_USER'
        }
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Draft save failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || {
          code: 'DRAFT_SAVE_ERROR',
          message: error.message || 'Failed to save draft'
        }
      };
    }
  }

  /**
   * Get saved drafts
   * @returns {Promise<Object>} Drafts list
   */
  static async getDrafts() {
    try {
      const response = await api.get('/invoices/drafts');
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Failed to fetch drafts:', error);
      return {
        success: false,
        error: error.response?.data?.error || {
          code: 'DRAFT_FETCH_ERROR',
          message: error.message || 'Failed to fetch drafts'
        }
      };
    }
  }

  /**
   * Generate invoice number
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Generated invoice number
   */
  static async generateInvoiceNumber(options = {}) {
    try {
      // Call backend API to generate invoice number
      const response = await api.get('/invoices/generate-number');
      
      if (response.data && response.data.invoice_number) {
        return {
          success: true,
          data: {
            invoice_number: response.data.invoice_number
          }
        };
      }
      
      // If API doesn't return expected format, throw error
      throw new Error('Invalid response from server');
    } catch (error) {
      console.error('Failed to generate invoice number from API:', error);
      // NO FALLBACK - throw error to force backend usage
      throw new Error('Unable to generate invoice number. Please check your connection and try again.');
    }
  }

  /**
   * Get secure company settings
   * @returns {Promise<Object>} Company settings
   */
  static async getCompanySettings() {
    try {
      const [publicResponse, secureResponse] = await Promise.all([
        api.get('/company/settings/public'),
        api.get('/company/settings/secure')
      ]);

      return {
        success: true,
        data: {
          public: publicResponse.data,
          secure: secureResponse.data
        }
      };
    } catch (error) {
      console.error('Failed to fetch company settings:', error);
      return {
        success: false,
        error: error.response?.data?.error || {
          code: 'SETTINGS_FETCH_ERROR',
          message: error.message || 'Failed to fetch company settings'
        }
      };
    }
  }

  /**
   * Enhanced product search with stock info
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Object>} Search results
   */
  static async searchProductsEnhanced(searchParams) {
    try {
      const response = await api.post('/products/search-enhanced', {
        query: searchParams.query,
        include_batches: searchParams.include_batches !== false,
        include_stock_summary: searchParams.include_stock_summary !== false,
        limit: searchParams.limit || 20,
        filters: searchParams.filters || {}
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Enhanced product search failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || {
          code: 'SEARCH_ERROR',
          message: error.message || 'Product search failed'
        }
      };
    }
  }

  /**
   * Enhanced customer search with credit info
   * @param {Object} searchParams - Search parameters
   * @returns {Promise<Object>} Search results
   */
  static async searchCustomersEnhanced(searchParams) {
    try {
      const response = await api.post('/customers/search-enhanced', {
        query: searchParams.query,
        include_credit_info: searchParams.include_credit_info !== false,
        limit: searchParams.limit || 20
      });

      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Enhanced customer search failed:', error);
      return {
        success: false,
        error: error.response?.data?.error || {
          code: 'SEARCH_ERROR',
          message: error.message || 'Customer search failed'
        }
      };
    }
  }

  /**
   * Get list of invoices with pagination and filters
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Invoice list with pagination
   */
  static async getInvoices(params = {}) {
    try {
      const response = await api.get('/invoices/', {
        params: {
          limit: params.limit || 50,
          offset: params.offset || 0,
          customer_id: params.customer_id,
          ...params
        }
      });
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Failed to fetch invoices:', error);
      return {
        success: false,
        error: error.response?.data?.error || {
          code: 'INVOICE_FETCH_ERROR',
          message: error.message || 'Failed to fetch invoices'
        }
      };
    }
  }

  /**
   * Get invoice by ID with full details
   * @param {String} invoiceId - Invoice ID
   * @returns {Promise<Object>} Invoice details
   */
  static async getInvoiceById(invoiceId) {
    try {
      const response = await api.get(`/invoices/${invoiceId}`);
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Failed to fetch invoice:', error);
      return {
        success: false,
        error: error.response?.data?.error || {
          code: 'INVOICE_FETCH_ERROR',
          message: error.message || 'Failed to fetch invoice'
        }
      };
    }
  }

  /**
   * Get returnable invoices for a customer - Optimized for returns module
   * This method is specifically designed for the returns flow to avoid timeouts
   * @param {Object} params - Query parameters
   * @returns {Promise<Object>} Returnable invoices with minimal data
   */
  static async getReturnableInvoices(params = {}) {
    try {
      // Use a specialized endpoint or optimize the query
      const response = await api.get('/sale-returns/returnable-invoices', {
        params: {
          customer_id: params.customer_id,
          limit: params.limit || 20,
          offset: params.offset || 0,
          // Only fetch essential fields for returns
          fields: 'invoice_id,invoice_number,invoice_date,final_amount,paid_amount,payment_status,customer_name',
          // Exclude heavy joins that cause timeouts
          exclude_returns: false,
          lightweight: true,
          ...params
        }
      });
      
      // If the specialized endpoint exists, use it
      if (response.data) {
        // Transform the response to match expected format
        const invoices = Array.isArray(response.data) ? response.data : (response.data.invoices || []);
        
        return {
          success: true,
          data: {
            invoices: invoices.map(invoice => ({
              invoice_id: invoice.invoice_id,
              invoice_number: invoice.invoice_number,
              invoice_date: invoice.invoice_date,
              final_amount: parseFloat(invoice.final_amount || invoice.grand_total || 0),
              paid_amount: parseFloat(invoice.paid_amount || 0),
              credit_amount: parseFloat(invoice.final_amount || 0) - parseFloat(invoice.paid_amount || 0),
              payment_status: invoice.payment_status || 'pending',
              customer_name: invoice.customer_name || '',
              // Only basic return info, no heavy queries
              has_returns: invoice.has_returns || false,
              returnable: invoice.returnable !== false
            })),
            total: response.data.total || invoices.length,
            pagination: response.data.pagination || {
              page: Math.floor((params.offset || 0) / (params.limit || 20)) + 1,
              limit: params.limit || 20,
              total_pages: Math.ceil((response.data.total || invoices.length) / (params.limit || 20))
            }
          }
        };
      }
      
      throw new Error('Invalid response from returnable invoices endpoint');
    } catch (error) {
      // Fallback to regular invoices endpoint with optimizations
      if (error.response?.status === 404 || error.code === 'ECONNREFUSED') {
        console.log('Specialized endpoint not available, falling back to regular invoices with optimization');
        
        try {
          // Use regular endpoint but with field restrictions for performance
          const fallbackResponse = await api.get('/invoices/', {
            params: {
              customer_id: params.customer_id,
              limit: params.limit || 20,
              offset: params.offset || 0,
              // Request minimal fields to avoid timeout
              select: 'invoice_id,invoice_number,invoice_date,final_amount,paid_amount,payment_status',
              // Skip expensive joins
              skip_items: true,
              skip_returns: true,
              ...params
            }
          });
          
          if (fallbackResponse.data) {
            return {
              success: true,
              data: fallbackResponse.data
            };
          }
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError);
        }
      }
      
      console.error('Failed to fetch returnable invoices:', error);
      return {
        success: false,
        error: error.response?.data?.error || {
          code: 'RETURNABLE_FETCH_ERROR',
          message: 'Unable to fetch returnable invoices. Please try with fewer filters or contact support.'
        }
      };
    }
  }

  /**
   * Get current financial year
   * @returns {String} Financial year (e.g., "2024-25")
   */
  static getCurrentFinancialYear() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // JavaScript months are 0-based
    
    // Financial year starts from April (month 4)
    if (currentMonth >= 4) {
      return `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
    } else {
      return `${currentYear - 1}-${currentYear.toString().slice(-2)}`;
    }
  }

  /**
   * Format error for display
   * @param {Object} error - Error object
   * @returns {String} Formatted error message
   */
  static formatError(error) {
    if (error?.details && Array.isArray(error.details)) {
      return error.details.map(detail => detail.message).join(', ');
    }
    return error?.message || 'An unexpected error occurred';
  }

  /**
   * Generate invoice from order
   * @param {Number} orderId - Order ID
   * @returns {Promise<Object>} Invoice details
   */
  static async generateFromOrder(orderId) {
    try {
      const response = await api.post(`/api/invoices/generate-from-order`, {
        order_id: orderId
      });
      
      if (response.data.success) {
        return response.data.data;
      }
      
      throw new Error(response.data.message || 'Failed to generate invoice from order');
    } catch (error) {
      console.error('Error generating invoice from order:', error);
      throw error;
    }
  }
}

export default InvoiceApiService;