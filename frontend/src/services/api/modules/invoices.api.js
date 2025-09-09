import { apiHelpers } from '../apiClient';
import { API_CONFIG } from '../../../config/api.config';
import { cleanData } from '../utils/dataUtils';
import offlineStorage from '../../offlineStorage';

const ENDPOINTS = API_CONFIG.ENDPOINTS.INVOICES;
const SALES_ENDPOINTS = API_CONFIG.ENDPOINTS.SALES;

export const invoicesApi = {
  // Get all invoices
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },
  
  // Get invoice by ID
  getById: (id) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${id}`);
  },
  
  // Create new invoice (through sales endpoint)
  create: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(SALES_ENDPOINTS.DIRECT_INVOICE, cleanedData);
  },
  
  // Update invoice
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(`${ENDPOINTS.BASE}/${id}`, cleanedData);
  },
  
  // Delete invoice
  delete: (id) => {
    return apiHelpers.delete(`${ENDPOINTS.BASE}/${id}`);
  },
  
  // Calculate invoice (live calculation)
  calculate: (data) => {
    return apiHelpers.post(ENDPOINTS.CALCULATE, data);
  },
  
  // Validate invoice
  validate: (data) => {
    return apiHelpers.post(ENDPOINTS.VALIDATE, data);
  },
  
  // Generate invoice number
  generateNumber: () => {
    return apiHelpers.get(ENDPOINTS.GENERATE_NUMBER);
  },
  
  // Draft management
  drafts: {
    // Get all drafts
    getAll: () => {
      return apiHelpers.get(ENDPOINTS.DRAFTS);
    },
    
    // Save draft
    save: (data) => {
      return apiHelpers.post(ENDPOINTS.DRAFTS, data);
    },
    
    // Get draft by ID
    getById: (id) => {
      return apiHelpers.get(`${ENDPOINTS.DRAFTS}/${id}`);
    },
    
    // Delete draft
    delete: (id) => {
      return apiHelpers.delete(`${ENDPOINTS.DRAFTS}/${id}`);
    },
  },
  
  // Get invoice PDF
  getPDF: (id) => {
    return apiHelpers.download(ENDPOINTS.PDF(id), `invoice-${id}.pdf`);
  },
  
  // Send invoice via WhatsApp
  sendWhatsApp: (id, phoneNumber) => {
    return apiHelpers.post(ENDPOINTS.WHATSAPP(id), { phone_number: phoneNumber });
  },
  
  // Search invoices
  search: (query, params = {}) => {
    return apiHelpers.get(SALES_ENDPOINTS.INVOICE_SEARCH, {
      params: { q: query, ...params }
    });
  },
  
  // Get invoice by number
  getByNumber: (invoiceNumber) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { invoice_number: invoiceNumber }
    });
  },
  
  // Cancel invoice
  cancel: (id, reason) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/${id}/cancel`, { reason });
  },
  
  // Get payment status
  getPaymentStatus: (id) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${id}/payment-status`);
  },
  
  // Record payment for invoice
  recordPayment: (id, paymentData) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/${id}/record-payment`, paymentData);
  },
  
  // Get payment history
  getPaymentHistory: (id) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${id}/payments`);
  },
  
  // Search invoices with enhanced filters
  searchInvoices: async (params = {}) => {
    const {
      query,
      invoice_type = 'SALES',
      customer_id,
      date_from,
      date_to,
      status,
      limit = 50,
      offset = 0,
      include_items = false,
      ...otherParams
    } = params;
    
    try {
      // Since the search endpoint doesn't exist, use the base invoices endpoint with filters
      if (query && query.trim()) {
        // For now, we'll use the base endpoint with customer_id filter
        // In the future, when backend implements search, we can use the search endpoint
      }
      
      // Otherwise try to get all invoices with filters
      const searchParams = {
        customer_id,
        date_from,
        date_to,
        status,
        limit,
        offset,
        ...otherParams
      };
      
      // Remove undefined values
      Object.keys(searchParams).forEach(key => 
        searchParams[key] === undefined && delete searchParams[key]
      );
      
      return await apiHelpers.get(ENDPOINTS.BASE, { params: searchParams });
    } catch (error) {
      if (error.response?.status === 404) {
        // Try to load from offline storage instead of generating mock data
        try {
          const offlineData = await offlineStorage.getOffline('invoices', { persistent: true });
          if (offlineData && offlineData.data) {
            const filteredInvoices = offlineData.data.filter(inv => 
              !query || 
              inv.invoice_number?.toLowerCase().includes(query.toLowerCase()) ||
              inv.customer_name?.toLowerCase().includes(query.toLowerCase())
            );
            
            return {
              success: true,
              data: {
                invoices: filteredInvoices,
                total: filteredInvoices.length
              }
            };
          }
        } catch (offlineError) {
        }
        
        // No offline data available - return empty result
        return {
          success: true,
          data: {
            invoices: [],
            total: 0
          }
        };
      }
      throw error;
    }
  },
  
  // Get invoices by customer
  getByCustomer: async (customerId, params = {}) => {
    try {
      const response = await apiHelpers.get(ENDPOINTS.BASE, {
        params: {
          customer_id: customerId,
          ...params
        }
      });
      
      // Transform response to ensure consistent format
      if (response.data) {
        const invoices = response.data.invoices || response.data || [];
        return {
          success: true,
          data: invoices
        };
      }
      
      return response;
    } catch (error) {
      if (error.response?.status === 404) {
        // Try to load from offline storage instead of generating mock data
        try {
          const offlineData = await offlineStorage.getOffline('invoices', { persistent: true });
          if (offlineData && offlineData.data) {
            const customerInvoices = offlineData.data.filter(inv => 
              inv.customer_id === customerId
            );
            
            return {
              success: true,
              data: customerInvoices
            };
          }
        } catch (offlineError) {
        }
        
        // No offline data available - return empty result
        return {
          success: true,
          data: []
        };
      }
      throw error;
    }
  },
  
  // Get recent invoices
  getRecent: (limit = 10) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: {
        sort: 'created_at',
        order: 'desc',
        limit
      }
    });
  },
};