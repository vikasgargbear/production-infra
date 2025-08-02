import { apiHelpers } from '../apiClient';
import { API_CONFIG } from '../../../config/api.config';
import { cleanData } from '../utils/dataUtils';
import { purchaseDataTransformer } from '../utils/purchaseDataTransformer';

const ENDPOINTS = API_CONFIG.ENDPOINTS.PURCHASES;

export const purchasesApi = {
  // Get all purchases
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
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
    
    const response = await apiHelpers.post(ENDPOINTS.ENHANCED + '/with-items', transformedData);
    
    if (response.data) {
      response.data = purchaseDataTransformer.transformBackendToPurchase(response.data);
    }
    
    return response;
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
  
  // Parse invoice PDF
  parseInvoice: async (formData) => {
    const response = await apiHelpers.upload(ENDPOINTS.PDF_PARSE, formData);
    
    // Transform parsed data to frontend format
    if (response.data && response.data.extracted_data) {
      response.data.extracted_data = purchaseDataTransformer.transformParsedDataToPurchase(response.data);
    }
    
    return response;
  },
  
  // Enhanced purchase operations
  enhanced: {
    // Get all with enhanced data
    getAll: (params = {}) => {
      return apiHelpers.get(ENDPOINTS.ENHANCED, { params });
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
};