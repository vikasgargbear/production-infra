// Returns Data Transformer
// Handles data transformation between frontend and backend formats for returns

export const returnsDataTransformer = {
  // Transform frontend sale return data to backend format
  transformSaleReturnToBackend: (returnData) => {
    if (!returnData) return null;
    
    return {
      // Map fields to match backend expectations
      customer_id: returnData.customer_id || returnData.party_id,
      invoice_id: returnData.invoice_id || returnData.document_id || returnData.sale_id,
      return_date: returnData.return_date || new Date().toISOString().split('T')[0],
      return_reason: returnData.return_reason || returnData.reason || '',
      custom_reason: returnData.custom_reason || '',
      notes: returnData.return_reason_notes || returnData.notes || '',
      
      // Transform items - only include items that are selected and have quantity > 0
      items: (returnData.items || [])
        .filter(item => item.selected && item.return_quantity > 0)
        .map(item => ({
          product_id: item.product_id,
          batch_id: item.batch_id || item.batch_no,
          batch_number: item.batch_number || item.batch_no,
          quantity: parseFloat(item.return_quantity || 0),
          return_quantity: parseFloat(item.return_quantity || 0), // Include both for compatibility
          rate: parseFloat(item.rate || item.unit_price || item.sale_price || 0),
          tax_percent: parseFloat(item.tax_percent || item.gst_percent || 0),
          discount_percent: parseFloat(item.discount_percent || 0),
          reason: item.reason || returnData.reason || returnData.return_reason || '',
          custom_reason: item.custom_reason || returnData.custom_reason || '',
          hsn_code: item.hsn_code || ''
        })),
      
      // Credit note details
      credit_note_no: returnData.return_invoice_no || returnData.credit_note_no,
      payment_mode: returnData.payment_mode || 'credit',
      credit_adjustment_type: returnData.credit_adjustment_type || 'future'
    };
  },
  
  // Transform frontend purchase return data to backend format
  transformPurchaseReturnToBackend: (returnData) => {
    if (!returnData) return null;
    
    return {
      supplier_id: returnData.supplier_id,
      original_purchase_id: returnData.document_id || returnData.purchase_id,
      return_date: returnData.return_date || new Date().toISOString().split('T')[0],
      reason: returnData.reason || '',
      custom_reason: returnData.custom_reason || '',
      notes: returnData.notes || '',
      
      // Transform items
      items: (returnData.items || []).map(item => ({
        product_id: item.product_id,
        batch_id: item.batch_id || item.batch_no,
        return_quantity: parseFloat(item.return_quantity || 0),
        cost_price: parseFloat(item.cost_price || item.purchase_price || 0),
        tax_percent: parseFloat(item.tax_percent || 0),
        reason: item.reason || returnData.reason || '',
        custom_reason: item.custom_reason || returnData.custom_reason || ''
      })),
      
      // Debit note details
      debit_note_no: returnData.debit_note_no,
      payment_mode: returnData.payment_mode || 'debit_note'
    };
  },
  
  // Transform backend sale return to frontend format
  transformBackendSaleReturn: (backendData) => {
    if (!backendData) return null;
    
    return {
      return_id: backendData.return_id,
      return_number: backendData.return_number,
      return_date: backendData.return_date,
      customer_id: backendData.party_id,
      customer_name: backendData.party_name,
      sale_id: backendData.original_sale_id,
      invoice_number: backendData.original_invoice_number,
      reason: backendData.reason,
      custom_reason: backendData.custom_reason,
      notes: backendData.notes,
      
      // Amounts
      subtotal_amount: parseFloat(backendData.subtotal_amount || 0),
      tax_amount: parseFloat(backendData.tax_amount || 0),
      total_amount: parseFloat(backendData.total_amount || 0),
      
      // Status
      return_status: backendData.return_status,
      credit_note_no: backendData.credit_note_no,
      
      // Transform items if present
      items: (backendData.items || []).map(item => ({
        return_item_id: item.return_item_id,
        product_id: item.product_id,
        product_name: item.product_name,
        batch_no: item.batch_id,
        return_quantity: parseFloat(item.return_quantity || 0),
        unit_price: parseFloat(item.unit_price || 0),
        tax_percent: parseFloat(item.tax_percent || 0),
        discount_percent: parseFloat(item.discount_percent || 0),
        line_total: parseFloat(item.line_total || item.total_amount || 0),
        reason: item.reason
      }))
    };
  },
  
  // Transform backend purchase return to frontend format
  transformBackendPurchaseReturn: (backendData) => {
    if (!backendData) return null;
    
    return {
      return_id: backendData.return_id,
      return_number: backendData.return_number,
      return_date: backendData.return_date,
      supplier_id: backendData.supplier_id,
      supplier_name: backendData.supplier_name,
      purchase_id: backendData.original_purchase_id,
      invoice_number: backendData.original_invoice,
      reason: backendData.reason,
      custom_reason: backendData.custom_reason,
      notes: backendData.notes,
      
      // Amounts
      subtotal_amount: parseFloat(backendData.subtotal_amount || 0),
      tax_amount: parseFloat(backendData.tax_amount || 0),
      total_amount: parseFloat(backendData.total_amount || 0),
      
      // Status
      return_status: backendData.return_status,
      debit_note_no: backendData.debit_note_no,
      
      // Transform items if present
      items: (backendData.items || []).map(item => ({
        return_item_id: item.return_item_id,
        product_id: item.product_id,
        product_name: item.product_name,
        batch_no: item.batch_id,
        return_quantity: parseFloat(item.return_quantity || 0),
        cost_price: parseFloat(item.cost_price || 0),
        tax_percent: parseFloat(item.tax_percent || 0),
        line_total: parseFloat(item.line_total || item.total_amount || 0),
        reason: item.reason
      }))
    };
  },
  
  // Validate return data
  validateReturnData: (returnData, type) => {
    const errors = [];
    
    if (type === 'sale') {
      if (!returnData.customer_id && !returnData.party_id) {
        errors.push('Customer is required');
      }
      if (!returnData.invoice_id && !returnData.original_sale_id) {
        errors.push('Original sale/invoice is required');
      }
    } else {
      if (!returnData.supplier_id) {
        errors.push('Supplier is required');
      }
      if (!returnData.original_purchase_id) {
        errors.push('Original purchase is required');
      }
    }
    
    if (!returnData.return_date) {
      errors.push('Return date is required');
    }
    
    // Validate items - check if any items exist (they're already filtered)
    if (!returnData.items || returnData.items.length === 0) {
      errors.push('At least one item must be selected with return quantity greater than 0');
    }
    
    // Validate each item that will be sent
    (returnData.items || []).forEach((item, index) => {
      if (!item.product_id) {
        errors.push(`Item ${index + 1}: Product is required`);
      }
      // For sales, items are already filtered for selected & quantity > 0
      // For purchases, we need to validate quantity
      if (type === 'purchase' && (!item.return_quantity || item.return_quantity <= 0)) {
        errors.push(`Item ${index + 1}: Return quantity must be greater than 0`);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

export default returnsDataTransformer;