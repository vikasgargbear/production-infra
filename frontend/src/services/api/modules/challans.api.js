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
  
  // Get challan by ID
  getById: async (id) => {
    return apiHelpers.get(`${CHALLAN_ENDPOINT}${id}/`);
  },
  
  // Create new challan
  create: async (data) => {
    // If order_id is provided, use it directly
    if (data.order_id) {
      const challanData = {
        order_id: data.order_id,
        customer_id: data.customer_id,
        challan_date: data.challan_date,
        expected_delivery_date: data.expected_delivery_date || data.challan_date,
        delivery_address: data.delivery_address || '',
        delivery_city: data.delivery_city || 'Mumbai',
        delivery_state: data.delivery_state || 'Maharashtra',
        delivery_pincode: data.delivery_pincode || '400001',
        transport_company: data.transport_company,
        vehicle_number: data.vehicle_number,
        lr_number: data.lr_number,
        notes: data.notes,
        items: data.items.map((item, index) => ({
          order_item_id: item.order_item_id || index + 1, // Use index+1 if no order_item_id
          product_id: item.product_id,
          product_name: item.product_name || item.name || 'Unknown Product', // Required field
          quantity: parseFloat(item.quantity),
          unit_price: parseFloat(item.unit_price || 0),
          ordered_quantity: parseFloat(item.quantity), // Same as quantity for direct challans
          dispatched_quantity: parseFloat(item.quantity) // Same as quantity for direct challans
        }))
      };
      
      return apiHelpers.post(CHALLAN_ENDPOINT, challanData);
    }
    
    // Otherwise, create order first
    const orderData = {
      org_id: localStorage.getItem('org_id') || 'ad808530-1ddb-4377-ab20-67bef145d80d',
      customer_id: data.customer_id,
      order_date: data.challan_date,
      order_type: 'sales',
      order_status: 'confirmed',
      payment_terms: 'cash',
      payment_status: 'pending',
      delivery_address: data.delivery_address,
      items: data.items.map(item => ({
        product_id: item.product_id,
        quantity: parseFloat(item.quantity),
        unit_price: parseFloat(item.unit_price || 0),
        tax_percent: parseFloat(item.gst_percent || 0),
        tax_amount: parseFloat(item.tax_amount || 0),
        discount_percent: 0
      }))
    };
    
    let orderId;
    try {
      const orderResponse = await apiHelpers.post('/orders/', orderData);
      orderId = orderResponse.data.order_id || orderResponse.data.id;
    } catch (error) {
      // If error includes "Order X not found", it means order was created but inventory failed
      const match = error.response?.data?.detail?.match(/Order (\d+) not found/);
      if (match) {
        orderId = parseInt(match[1]);
      } else {
        throw error;
      }
    }
    
    // Now create challan with the order
    const challanData = {
      order_id: orderId,
      customer_id: data.customer_id,
      challan_date: data.challan_date,
      expected_delivery_date: data.expected_delivery_date || data.challan_date,
      delivery_address: data.delivery_address || '',
      delivery_city: data.delivery_city || 'Mumbai',
      delivery_state: data.delivery_state || 'Maharashtra',
      delivery_pincode: data.delivery_pincode || '400001',
      transport_company: data.transport_company,
      vehicle_number: data.vehicle_number,
      lr_number: data.lr_number,
      notes: data.notes,
      items: data.items.map((item, index) => ({
        order_item_id: item.order_item_id || orderId * 1000 + index + 1, // Generate unique order_item_id
        product_id: item.product_id,
        product_name: item.product_name || item.name || 'Unknown Product', // Required field
        quantity: parseFloat(item.quantity),
        unit_price: parseFloat(item.unit_price || 0),
        ordered_quantity: parseFloat(item.quantity), // Same as quantity for new challans
        dispatched_quantity: parseFloat(item.quantity) // Same as quantity for new challans
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