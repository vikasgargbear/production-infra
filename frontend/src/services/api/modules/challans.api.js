import { apiHelpers } from '../apiClient';
import { cleanData } from '../utils/dataUtils';

/**
 * Challans API Module
 * 
 * Uses the /enterprise-delivery-challan/ endpoint which requires:
 * 1. An existing order_id
 * 2. Delivery details (address, city, state, pincode)
 * 
 * Workflow:
 * 1. Create order first (if not existing)
 * 2. Create challan referencing the order
 */

const CHALLAN_ENDPOINT = '/enterprise-delivery-challan/';

export const challansApi = {
  // Get all challans
  getAll: async (params = {}) => {
    return apiHelpers.get(CHALLAN_ENDPOINT, { params });
  },
  
  // Search challans
  search: async (params = {}) => {
    return apiHelpers.get(CHALLAN_ENDPOINT, { params });
  },
  
  // Get challan by ID
  getById: async (id) => {
    return apiHelpers.get(`${CHALLAN_ENDPOINT}${id}/`);
  },
  
  // Create new challan
  create: async (data) => {
    // Direct challan creation - no order required
    const challanData = {
      // order_id is optional - challan can be independent
      order_id: data.order_id || null,
      customer_id: data.customer_id,
      challan_date: data.challan_date || new Date().toISOString().split('T')[0],
      dispatch_date: data.dispatch_date || data.challan_date,
      expected_delivery_date: data.expected_delivery_date || data.challan_date,
      delivery_address: data.delivery_address || '',
      delivery_city: data.delivery_city || 'Mumbai',
      delivery_state: data.delivery_state || 'Maharashtra',
      delivery_pincode: data.delivery_pincode || '400001',
      transport_company: data.transport_company,
      vehicle_number: data.vehicle_number,
      lr_number: data.lr_number,
      freight_charges: parseFloat(data.freight_charges || 0),
      notes: data.notes,
      items: data.items.map((item, index) => ({
        order_item_id: item.order_item_id || null, // Optional for independent challans
        product_id: item.product_id,
        product_name: item.product_name || item.name || 'Unknown Product',
        batch_id: item.batch_id || null,
        batch_number: item.batch_number || null,
        quantity: parseFloat(item.quantity || 0),
        unit_price: parseFloat(item.unit_price || 0),
        // GST structure matching invoices - comes from product/batch selection
        gst_percent: parseFloat(item.gst_percent || item.tax_percent || 0),
        cgst_percent: parseFloat(item.cgst_percent || (item.gst_percent ? item.gst_percent/2 : 0) || 0),
        sgst_percent: parseFloat(item.sgst_percent || (item.gst_percent ? item.gst_percent/2 : 0) || 0),
        igst_percent: parseFloat(item.igst_percent || 0), // For inter-state
        ordered_quantity: parseFloat(item.ordered_quantity || item.quantity || 0),
        dispatched_quantity: parseFloat(item.dispatched_quantity || item.quantity || 0)
      }))
    };
    
    return apiHelpers.post(CHALLAN_ENDPOINT, challanData);
  },
  
  // Create challan from order (legacy support)
  createFromOrder: async (orderId, data) => {
    const challanData = {
      order_id: orderId,
      customer_id: data.customer_id,
      challan_date: data.challan_date || new Date().toISOString().split('T')[0],
      dispatch_date: data.dispatch_date || data.challan_date,
      expected_delivery_date: data.expected_delivery_date || data.challan_date,
      delivery_address: data.delivery_address || '',
      delivery_city: data.delivery_city || 'Mumbai', 
      delivery_state: data.delivery_state || 'Maharashtra',
      delivery_pincode: data.delivery_pincode || '400001',
      transport_company: data.transport_company,
      vehicle_number: data.vehicle_number,
      lr_number: data.lr_number,
      freight_charges: parseFloat(data.freight_charges || 0),
      notes: data.notes,
      items: data.items.map((item, index) => ({
        order_item_id: item.order_item_id || index + 1,
        product_id: item.product_id,
        product_name: item.product_name || item.name || 'Unknown Product',
        batch_id: item.batch_id || null,
        batch_number: item.batch_number || null,
        quantity: parseFloat(item.quantity || 0),
        unit_price: parseFloat(item.unit_price || 0),
        ordered_quantity: parseFloat(item.ordered_quantity || item.quantity || 0),
        dispatched_quantity: parseFloat(item.dispatched_quantity || item.quantity || 0)
      }))
    };
    
    return apiHelpers.post(CHALLAN_ENDPOINT, challanData);
  },
  
  // Update challan
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(`${CHALLAN_ENDPOINT}${id}/`, cleanedData);
  },
  
  // Delete challan
  delete: (id) => {
    return apiHelpers.delete(`${CHALLAN_ENDPOINT}${id}/`);
  },
  
  // Convert challan to invoice (using existing endpoint that works)
  convertToInvoice: async (challanIds, data = {}) => {
    const challanId = Array.isArray(challanIds) ? challanIds[0] : challanIds;
    
    try {
      // First get the challan data
      const challanResponse = await apiHelpers.get(`${CHALLAN_ENDPOINT}${challanId}/`);
      const challan = challanResponse.data;
      
      if (!challan) {
        throw new Error(`Challan ${challanId} not found`);
      }
      
      // Note: Allowing invoice creation for any challan status - user discretion
      
      // Prepare data for enterprise quick-sale endpoint
      const invoiceData = {
        customer_id: challan.customer_id,
        items: (challan.items || []).map(item => ({
          product_id: item.product_id,
          quantity: item.dispatched_quantity || item.quantity,
          unit_price: item.unit_price,
          discount_percent: 0,
          batch_id: item.batch_id
        })),
        payment_mode: data.payment_mode || 'credit',
        payment_amount: data.payment_amount || 0,
        discount_amount: data.discount_amount || 0,
        notes: data.notes || `Created from Delivery Challan #${challan.challan_number || challanId}`,
        challan_id: challanId
      };
      
      // Create invoice using enterprise quick-sale
      const response = await apiHelpers.post('/enterprise-orders/quick-sale', invoiceData);
      return response;
      
    } catch (error) {
      console.error('Error converting challan to invoice:', error);
      throw error;
    }
  },

  // Legacy convert method for backward compatibility
  convertToInvoiceLegacy: (id, data = {}) => {
    return apiHelpers.post(`${CHALLAN_ENDPOINT}${id}/convert-to-invoice/`, data);
  },
  
  // Update delivery status
  updateDeliveryStatus: (id, status, data = {}) => {
    return apiHelpers.patch(`${CHALLAN_ENDPOINT}${id}/delivery-status/`, {
      status,
      ...data
    });
  },
  
  // Get challan PDF
  getPDF: (id) => {
    return apiHelpers.download(`${CHALLAN_ENDPOINT}${id}/pdf/`, `challan-${id}.pdf`);
  },
  
  // Send challan via WhatsApp
  sendWhatsApp: (id, phoneNumber) => {
    return apiHelpers.post(`${CHALLAN_ENDPOINT}${id}/whatsapp/`, { phone_number: phoneNumber });
  },
  
  // Draft management
  drafts: {
    // Save draft
    save: (data) => {
      return apiHelpers.post(`${CHALLAN_ENDPOINT}drafts/`, data);
    },
    
    // Get draft
    get: (id) => {
      return apiHelpers.get(`${CHALLAN_ENDPOINT}drafts/${id}/`);
    },
    
    // Delete draft
    delete: (id) => {
      return apiHelpers.delete(`${CHALLAN_ENDPOINT}drafts/${id}/`);
    },
  },
  
  // Get pending deliveries
  getPendingDeliveries: () => {
    return apiHelpers.get(CHALLAN_ENDPOINT, {
      params: { delivery_status: 'pending' }
    });
  },
  
  // Get today's deliveries
  getTodaysDeliveries: () => {
    const today = new Date().toISOString().split('T')[0];
    return apiHelpers.get(CHALLAN_ENDPOINT, {
      params: { delivery_date: today }
    });
  },
};