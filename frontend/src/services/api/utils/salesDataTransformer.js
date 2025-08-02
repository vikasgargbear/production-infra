/**
 * Sales Data Transformer
 * Transforms data between frontend and backend formats for sales module
 */

export const salesDataTransformer = {
  /**
   * Transform frontend invoice data to backend sale format
   */
  transformInvoiceToSale: (invoiceData) => {
    // Extract customer details
    const customerDetails = invoiceData.customer_details || {};
    
    return {
      // Date fields
      sale_date: invoiceData.invoice_date,
      
      // Party fields (backend uses 'party', frontend uses 'customer')
      party_id: invoiceData.customer_id,
      party_name: invoiceData.customer_name,
      party_gst: customerDetails.gst_number || customerDetails.gstin || null,
      party_address: invoiceData.billing_address,
      party_phone: customerDetails.phone || customerDetails.mobile || null,
      party_state_code: customerDetails.state_code || extractStateCode(customerDetails.gst_number),
      
      // Payment details
      payment_mode: invoiceData.payment_mode || 'cash',
      
      // Transform items
      items: invoiceData.items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        hsn_code: item.hsn_code,
        batch_id: item.batch_id || null,
        batch_number: item.batch_number || item.batch_no || null,
        expiry_date: item.expiry_date,
        quantity: parseInt(item.quantity),
        unit: item.unit || 'strip',
        unit_price: parseFloat(item.rate || item.unit_price || 0), // Backend expects unit_price
        mrp: parseFloat(item.mrp || 0),
        discount_percent: parseFloat(item.discount_percent || 0),
        tax_percent: parseFloat(item.tax_rate || item.tax_percent || item.gst_percent || 0), // Backend expects tax_percent
      })),
      
      // Additional charges
      discount_amount: parseFloat(invoiceData.discount_amount || 0),
      other_charges: parseFloat(invoiceData.other_charges || 0),
      notes: invoiceData.notes || null,
      
      // GST details
      seller_gstin: invoiceData.seller_gstin || null,
    };
  },

  /**
   * Transform backend sale response to frontend format
   */
  transformSaleToInvoice: (saleData) => {
    return {
      invoice_id: saleData.sale_id,
      invoice_number: saleData.invoice_number,
      invoice_date: saleData.sale_date,
      
      // Customer details
      customer_id: saleData.party_id,
      customer_name: saleData.party_name,
      customer_gstin: saleData.party_gst,
      
      // Amount details
      subtotal_amount: saleData.subtotal_amount,
      discount_amount: saleData.discount_amount,
      tax_amount: saleData.tax_amount,
      cgst_amount: saleData.cgst_amount,
      sgst_amount: saleData.sgst_amount,
      igst_amount: saleData.igst_amount,
      total_amount: saleData.total_amount,
      
      // Other details
      gst_type: saleData.gst_type,
      payment_mode: saleData.payment_mode,
      payment_status: saleData.sale_status === 'completed' ? 'paid' : 'pending',
      created_at: saleData.created_at,
    };
  },

  /**
   * Transform sale items from backend to frontend format
   */
  transformSaleItems: (items) => {
    return items.map(item => ({
      ...item,
      rate: item.unit_price, // Frontend uses 'rate'
      tax_rate: item.tax_percent, // Frontend uses 'tax_rate'
      gst_percent: item.tax_percent,
      amount: item.line_total,
    }));
  },

  /**
   * Validate required fields before sending to backend
   */
  validateSaleData: (saleData) => {
    const errors = [];

    if (!saleData.party_id) {
      errors.push('Customer is required');
    }

    if (!saleData.items || saleData.items.length === 0) {
      errors.push('At least one item is required');
    }

    saleData.items.forEach((item, index) => {
      if (!item.product_id) {
        errors.push(`Item ${index + 1}: Product is required`);
      }
      if (!item.quantity || item.quantity <= 0) {
        errors.push(`Item ${index + 1}: Valid quantity is required`);
      }
      if (item.unit_price === undefined || item.unit_price < 0) {
        errors.push(`Item ${index + 1}: Valid price is required`);
      }
      if (item.tax_percent === undefined || item.tax_percent < 0) {
        errors.push(`Item ${index + 1}: Valid tax rate is required`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

/**
 * Extract state code from GST number
 */
function extractStateCode(gstNumber) {
  if (!gstNumber || gstNumber.length < 2) return null;
  return gstNumber.substring(0, 2);
}

export default salesDataTransformer;