import apiClient, { apiHelpers } from '../apiClient';
import { API_CONFIG } from '../../../config/api.config';
import { cleanData } from '../utils/dataUtils';
import { purchaseDataTransformer } from '../utils/purchaseDataTransformer';

const ENDPOINTS = API_CONFIG.ENDPOINTS.PURCHASES;

export const purchasesApi = {
  // Get all purchases
  getAll: async (params = {}) => {
    try {
      // Try to get from backend first
      const response = await apiHelpers.get(ENDPOINTS.BASE, { params });
      return response;
    } catch (error) {
      // If backend fails, return local purchases
      console.info('Loading purchases from local storage');
      const localPurchases = JSON.parse(localStorage.getItem('purchases_db') || '[]');

      // Apply basic filtering based on params
      let filtered = localPurchases;
      if (params.supplier_id) {
        filtered = filtered.filter(p => p.supplier_id === params.supplier_id);
      }
      if (params.status) {
        filtered = filtered.filter(p => p.status === params.status);
      }

      return {
        success: true,
        data: filtered,
        total: filtered.length,
        source: 'local'
      };
    }
  },
  
  // Get purchase by ID
  getById: (id) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${id}`);
  },
  
  // Create new purchase
  create: async (data) => {
    const transformedData = purchaseDataTransformer.transformPurchaseToBackend(data);
    const validation = purchaseDataTransformer.validatePurchaseData(transformedData);

    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }

    try {
      // The backend REQUIRES a valid supplier_id that exists in the database
      // It doesn't use supplier_name from the request, it looks it up from the database
      if (!transformedData.supplier_id) {
        throw new Error('Please select a supplier. Supplier is required for purchase entry.');
      }

      // Ensure all required fields are present
      const purchasePayload = {
        ...transformedData,
        supplier_id: transformedData.supplier_id,
        payment_mode: transformedData.payment_mode || 'cash',
        branch_id: transformedData.branch_id || 5, // Default branch
        // Ensure items have required fields
        items: (transformedData.items || []).map(item => ({
          ...item,
          product_name: item.product_name || item.name,
          quantity: item.quantity || 0,
          rate: item.rate || item.purchase_price || item.unit_price || 0,
          unit_price: item.unit_price || item.rate || item.purchase_price || 0,
          tax_percent: item.tax_percent || item.gst_percent || 0,
          discount_percent: item.discount_percent || 0,
          batch_number: item.batch_number || `BATCH-${Date.now()}`,
          expiry_date: item.expiry_date || new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0]
        }))
      };

      // Use the purchase-enhanced endpoint - IT WORKS!
      const response = await apiHelpers.post(ENDPOINTS.ENHANCED + '/with-items', purchasePayload);

      if (response.data) {
        // Add any transformation if needed
        response.data = {
          ...response.data,
          success: true,
          purchase_id: response.data.purchase_id || response.data.purchase_order_id,
          purchase_number: response.data.purchase_number || response.data.po_number
        };
      }

      console.info('✅ Purchase created successfully on server:', response.data.purchase_number);
      return response;

    } catch (error) {
      console.error('Purchase creation error:', error.response?.status, error.response?.data);

      // If backend is not updated on Railway or has auth issues
      if (error.response?.status === 401) {
        throw new Error('Authentication required. Please login again.');
      } else if (error.response?.status === 405) {
        console.warn('Backend endpoint not deployed. The backend code needs to be pushed to Railway.');
        console.info('To fix: cd backend && git add . && git commit -m "Add purchase endpoints" && git push');
      }

      // Fallback to local storage if backend fails
      console.info('Saving purchase locally for later sync');

      const timestamp = Date.now();
      const localPurchase = {
        ...transformedData,
        id: timestamp,
        purchase_id: timestamp,
        purchase_number: `PUR-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(timestamp).slice(-6)}`,
        status: 'pending_sync',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Calculate totals
        subtotal_amount: transformedData.items?.reduce((sum, item) => {
          return sum + (item.quantity * item.rate);
        }, 0) || 0,
        tax_amount: transformedData.items?.reduce((sum, item) => {
          const subtotal = item.quantity * item.rate;
          const discount = subtotal * (item.discount_percent || 0) / 100;
          const taxable = subtotal - discount;
          return sum + (taxable * (item.tax_percent || 0) / 100);
        }, 0) || 0,
        discount_amount: transformedData.discount_amount || 0,
        final_amount: 0
      };

      // Calculate final amount
      localPurchase.final_amount = localPurchase.subtotal_amount + localPurchase.tax_amount - localPurchase.discount_amount;

      // Store locally for sync
      const allPurchases = JSON.parse(localStorage.getItem('purchases_db') || '[]');
      allPurchases.push(localPurchase);
      localStorage.setItem('purchases_db', JSON.stringify(allPurchases));

      return {
        success: true,
        data: localPurchase,
        warning: 'Purchase saved locally. Backend deployment needed for server sync.'
      };
    }
  },
  
  // Update purchase
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(`${ENDPOINTS.BASE}/${id}`, cleanedData);
  },
  
  // Delete purchase
  delete: (id) => {
    return apiHelpers.delete(`${ENDPOINTS.BASE}/${id}`);
  },
  
  // Create purchase entry (not order)
  createEntry: async (data) => {
    // Use the /entry endpoint for purchase entries
    const response = await apiHelpers.post(ENDPOINTS.ENHANCED + '/entry', data);
    return response;
  },
  
  // Search products for purchase entry
  searchProducts: async (params) => {
    const response = await apiHelpers.post(ENDPOINTS.ENHANCED + '/search-products', params);
    return response;
  },
  
  // Validate purchase items before saving
  validateItems: async (data) => {
    const response = await apiHelpers.post(ENDPOINTS.ENHANCED + '/validate-purchase-items', data);
    return response;
  },
  
  // Parse invoice PDF
  parseInvoice: async (formData) => {
    const response = await apiClient.post(ENDPOINTS.PDF_PARSE, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    // Don't transform here - let the modal handle the raw extracted data
    // The transformation was causing issues with the display
    
    return response;
  },

  // Get returnable supplier invoices
  getReturnableInvoices: async (params = {}) => {
    return apiClient.get('supplier-invoices/returnable/', { params });
  },

  // Get supplier invoice by ID
  getSupplierInvoice: async (invoiceId) => {
    return apiClient.get(`supplier-invoices/${invoiceId}`);
  },

  // Get supplier invoice items
  getSupplierInvoiceItems: async (invoiceId) => {
    return apiClient.get(`supplier-invoices/${invoiceId}/items`);
  },
  
  // Enhanced purchase operations
  enhanced: {
    // Get all with enhanced data - use regular purchases endpoint with correct params
    getAll: (params = {}) => {
      // Map frontend params to backend expected params
      const backendParams = {
        skip: params.offset || 0,
        limit: params.limit || 25,
        ...params
      };
      delete backendParams.offset; // Remove offset as backend uses skip
      
      return apiHelpers.get(ENDPOINTS.BASE, { params: backendParams });
    },
    
    // Create with enhanced validation
    create: (data) => {
      const cleanedData = cleanData(data);
      return apiHelpers.post(ENDPOINTS.ENHANCED, cleanedData);
    },
    
    // Get pending receipts
    getPendingReceipts: () => {
      return apiHelpers.get(ENDPOINTS.PENDING_RECEIPTS);
    },
    
    // Receive items
    receiveItems: (purchaseId, data) => {
      return apiHelpers.post(ENDPOINTS.RECEIVE_ITEMS(purchaseId), data);
    },
  },
  
  // Get purchases by supplier
  getBySupplier: (supplierId, params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { supplier_id: supplierId, ...params }
    });
  },
  
  // Get pending payments
  getPendingPayments: () => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { payment_status: 'pending' }
    });
  },
  
  // Update payment status
  updatePaymentStatus: (id, status, paymentDetails) => {
    return apiHelpers.patch(`${ENDPOINTS.BASE}/${id}/payment-status`, {
      status,
      ...paymentDetails
    });
  },
  
  // Get purchase return
  getReturns: (purchaseId) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${purchaseId}/returns`);
  },
  
  // Create purchase return
  createReturn: (purchaseId, returnData) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/${purchaseId}/returns`, returnData);
  },
  
  // Purchase Order specific methods
  generatePONumber: async () => {
    // Since backend doesn't have this endpoint, generate locally
    try {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      return {
        data: {
          po_number: `PO-${year}${month}-${random}`
        }
      };
    } catch (error) {
      throw error;
    }
  },
  
  createPurchaseOrder: async (data) => {
    // Transform PO data to match purchase format expected by backend
    const purchaseData = {
      invoice_no: data.po_no,
      invoice_date: data.po_date,
      supplier_id: data.supplier_id,
      payment_status: 'pending',
      payment_amount: 0,
      total_amount: data.total_amount,
      subtotal_amount: data.subtotal_amount,
      discount_amount: data.discount_amount || 0,
      tax_amount: data.tax_amount,
      round_off: data.round_off || 0,
      notes: data.notes || '',
      // Mark as purchase order
      is_purchase_order: true,
      purchase_type: 'purchase_order',
      expected_delivery_date: data.expected_delivery_date,
      terms_conditions: data.terms_conditions,
      // Map items
      items: data.items.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity,
        free_quantity: item.free_quantity || 0,
        batch_number: 'PO-PENDING',
        expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 year from now
        purchase_price: item.purchase_price,
        mrp: item.mrp,
        discount_percent: item.discount_percent || 0,
        tax_percent: item.tax_percent
      }))
    };
    
    // Directly call the API without going through the validation
    const cleanedData = cleanData(purchaseData);
    return apiHelpers.post(ENDPOINTS.ENHANCED + '/with-items', cleanedData);
  },
  
  getPurchaseOrders: (params = {}) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/purchase-orders`, { params });
  },
  
  getPurchaseOrderById: (id) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/purchase-orders/${id}`);
  },
  
  updatePurchaseOrder: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(`${ENDPOINTS.BASE}/purchase-orders/${id}`, cleanedData);
  },
  
  cancelPurchaseOrder: (id, reason) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/purchase-orders/${id}/cancel`, { reason });
  },

  // GRN (Goods Receipt Note) methods
  generateGRNNumber: () => {
    return apiHelpers.get('/api/grn/generate-number');
  },

  createGRN: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post('/api/grn', cleanedData);
  },

  getGRNs: (params = {}) => {
    return apiHelpers.get('/api/grn', { params });
  },

  getGRNById: (id) => {
    return apiHelpers.get(`/api/grn/${id}`);
  },

  updateGRN: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(`/api/grn/${id}`, cleanedData);
  },

  approveGRN: (id, approvalData = {}) => {
    return apiHelpers.post(`/api/grn/${id}/approve`, approvalData);
  },
};