// Purchase Data Transformer
// Handles data transformation between frontend and backend formats

export const purchaseDataTransformer = {
  // Transform frontend purchase data to backend format
  transformPurchaseToBackend: (purchaseData) => {
    if (!purchaseData) return null;
    
    return {
      // Basic fields
      supplier_id: purchaseData.supplier_id,
      purchase_date: purchaseData.purchase_date || new Date().toISOString().split('T')[0],
      supplier_invoice_number: purchaseData.invoice_number,
      supplier_invoice_date: purchaseData.invoice_date,
      
      // Transform amounts
      subtotal_amount: parseFloat(purchaseData.subtotal_amount || 0),
      tax_amount: parseFloat(purchaseData.tax_amount || 0),
      discount_amount: parseFloat(purchaseData.discount_amount || 0),
      final_amount: parseFloat(purchaseData.final_amount || 0),
      other_charges: parseFloat(purchaseData.other_charges || 0),
      
      // Status fields
      payment_mode: purchaseData.payment_mode || 'cash',
      payment_status: purchaseData.payment_status || 'pending',
      purchase_status: purchaseData.purchase_status || 'draft',
      
      // Optional fields
      notes: purchaseData.notes || '',
      
      // Transform items array
      items: (purchaseData.items || []).map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        ordered_quantity: parseFloat(item.quantity || 0), // quantity -> ordered_quantity
        received_quantity: parseFloat(item.received_quantity || 0),
        free_quantity: parseFloat(item.free_quantity || 0),
        cost_price: parseFloat(item.purchase_price || 0), // purchase_price -> cost_price
        selling_price: parseFloat(item.selling_price || 0),
        mrp: parseFloat(item.mrp || 0),
        tax_percent: parseFloat(item.tax_percent || 0),
        discount_percent: parseFloat(item.discount_percent || 0),
        batch_number: item.batch_number || '',
        expiry_date: item.expiry_date || null,
        manufacturing_date: item.manufacturing_date || null,
        item_status: item.item_status || 'pending',
        notes: item.notes || ''
      }))
    };
  },
  
  // Transform backend purchase data to frontend format
  transformBackendToPurchase: (backendData) => {
    if (!backendData) return null;
    
    return {
      // Basic fields
      purchase_id: backendData.purchase_id,
      purchase_number: backendData.purchase_number,
      supplier_id: backendData.supplier_id,
      supplier_name: backendData.supplier_name,
      invoice_number: backendData.supplier_invoice_number, // supplier_invoice_number -> invoice_number
      invoice_date: backendData.supplier_invoice_date, // supplier_invoice_date -> invoice_date
      purchase_date: backendData.purchase_date,
      
      // Amounts
      subtotal_amount: parseFloat(backendData.subtotal_amount || 0),
      tax_amount: parseFloat(backendData.tax_amount || 0),
      discount_amount: parseFloat(backendData.discount_amount || 0),
      final_amount: parseFloat(backendData.final_amount || 0),
      other_charges: parseFloat(backendData.other_charges || 0),
      
      // Status fields
      payment_mode: backendData.payment_mode,
      payment_status: backendData.payment_status,
      purchase_status: backendData.purchase_status,
      
      // Optional fields
      notes: backendData.notes || '',
      grn_number: backendData.grn_number,
      grn_date: backendData.grn_date,
      
      // Transform items if present
      items: (backendData.items || []).map(item => ({
        purchase_item_id: item.purchase_item_id,
        product_id: item.product_id,
        product_name: item.product_name || item.product_full_name,
        quantity: parseFloat(item.ordered_quantity || 0), // ordered_quantity -> quantity
        received_quantity: parseFloat(item.received_quantity || 0),
        free_quantity: parseFloat(item.free_quantity || 0),
        purchase_price: parseFloat(item.cost_price || 0), // cost_price -> purchase_price
        selling_price: parseFloat(item.selling_price || 0),
        mrp: parseFloat(item.mrp || 0),
        tax_percent: parseFloat(item.tax_percent || 0),
        discount_percent: parseFloat(item.discount_percent || 0),
        line_total: parseFloat(item.total_price || item.line_total || 0),
        batch_number: item.batch_number || '',
        expiry_date: item.expiry_date || '',
        manufacturing_date: item.manufacturing_date || '',
        item_status: item.item_status,
        hsn_code: item.hsn_code,
        category: item.category,
        brand_name: item.brand_name
      }))
    };
  },
  
  // Transform PDF parsed data to purchase format
  transformParsedDataToPurchase: (parsedData) => {
    if (!parsedData) return null;
    
    const extractedData = parsedData.extracted_data || parsedData;
    
    return {
      supplier_id: extractedData.supplier_id || '',
      supplier_name: extractedData.supplier_name || '',
      invoice_number: extractedData.invoice_number || '',
      invoice_date: extractedData.invoice_date || new Date().toISOString().split('T')[0],
      subtotal_amount: parseFloat(extractedData.subtotal || 0),
      tax_amount: parseFloat(extractedData.tax_amount || 0),
      discount_amount: parseFloat(extractedData.discount_amount || 0),
      final_amount: parseFloat(extractedData.grand_total || 0),
      
      items: (extractedData.items || []).map(item => ({
        product_name: item.product_name || '',
        hsn_code: item.hsn_code || '',
        batch_number: item.batch_number || '',
        expiry_date: item.expiry_date || '',
        quantity: parseFloat(item.quantity || 0),
        purchase_price: parseFloat(item.cost_price || 0),
        mrp: parseFloat(item.mrp || 0),
        discount_percent: parseFloat(item.discount_percent || 0),
        tax_percent: parseFloat(item.tax_percent || 12),
        line_total: parseFloat(item.amount || 0)
      }))
    };
  },
  
  // Validate purchase data
  validatePurchaseData: (purchaseData) => {
    const errors = [];
    
    if (!purchaseData.supplier_id) {
      errors.push('Supplier is required');
    }
    
    if (!purchaseData.supplier_invoice_number) {
      errors.push('Invoice number is required');
    }
    
    if (!purchaseData.items || purchaseData.items.length === 0) {
      errors.push('At least one item is required');
    }
    
    // Validate items
    purchaseData.items?.forEach((item, index) => {
      if (!item.product_id) {
        errors.push(`Item ${index + 1}: Product is required`);
      }
      if (!item.ordered_quantity || item.ordered_quantity <= 0) {
        errors.push(`Item ${index + 1}: Quantity must be greater than 0`);
      }
      if (!item.cost_price || item.cost_price <= 0) {
        errors.push(`Item ${index + 1}: Cost price must be greater than 0`);
      }
    });
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

export default purchaseDataTransformer;