// Data utility functions for API operations

// Fields that should be converted to numbers
const NUMERIC_FIELDS = [
  'gst_percent', 'cgst_percent', 'sgst_percent', 'igst_percent',
  'mrp', 'sale_price', 'purchase_price', 'cost_price',
  'total_amount', 'discount', 'discount_amount', 'final_amount',
  'credit_limit', 'quantity', 'tax_percent', 'tax_amount',
  'subtotal_amount', 'line_total', 'amount', 'rate',
  'min_stock', 'max_stock', 'current_stock',
  'opening_balance', 'closing_balance', 'payment_amount',
  'outstanding_amount', 'paid_amount', 'balance_amount'
];

// Fields that should be converted to integers
const INTEGER_FIELDS = [
  'product_id', 'customer_id', 'supplier_id', 'user_id',
  'order_id', 'invoice_id', 'purchase_id', 'challan_id',
  'payment_terms', 'credit_days', 'credit_period_days',
  // Pack configuration fields that are integers
  'pack_quantity', 'pack_multiplier', 'unit_count', 'packages_per_box'
];

// Fields that should remain as strings even if numeric
const STRING_FIELDS = [
  'phone', 'mobile', 'alternate_phone', 'pincode', 'gstin', 'gst_number', 'pan', 'pan_number',
  'drug_license_no', 'drug_license_number', 'fssai_license_no',
  'invoice_number', 'order_number', 'challan_number', 'batch_number',
  'supplier_code', 'customer_code', 'product_code',
  'bank_account_no', 'account_number', 'bank_ifsc_code', 'ifsc_code',
  // Pack configuration fields that should remain strings
  'pack_type', 'pack_size', 'pack_input', 'pack_unit_type', 'unit_measurement'
];

/**
 * Clean data before sending to API
 * - Removes empty strings
 * - Converts numeric strings to numbers
 * - Handles special cases
 */
export const cleanData = (data) => {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  // Debug: Log pack fields being sent
  if (data.pack_input || data.pack_quantity || data.pack_multiplier) {
    console.log('cleanData - Pack fields in request:');
    console.log('  pack_input:', data.pack_input);
    console.log('  pack_quantity:', data.pack_quantity);
    console.log('  pack_multiplier:', data.pack_multiplier);
    console.log('  pack_unit_type:', data.pack_unit_type);
  }
  
  const cleanedData = {};
  
  Object.keys(data).forEach(key => {
    const value = data[key];
    
    // Skip null or undefined values (but keep pack fields even if null)
    if (value === null || value === undefined) {
      // Keep pack fields even if null
      if (key.startsWith('pack_') || key === 'unit_count' || key === 'unit_measurement' || key === 'packages_per_box') {
        cleanedData[key] = value;
      }
      return;
    }
    
    // Skip empty strings unless it's a valid empty field
    if (value === '' && !['notes', 'description', 'remarks'].includes(key)) {
      return;
    }
    
    // Handle arrays recursively
    if (Array.isArray(value)) {
      cleanedData[key] = value.map(item => 
        typeof item === 'object' ? cleanData(item) : item
      );
      return;
    }
    
    // Handle nested objects recursively
    if (typeof value === 'object' && !(value instanceof Date)) {
      cleanedData[key] = cleanData(value);
      return;
    }
    
    // Keep string fields as strings
    if (STRING_FIELDS.includes(key)) {
      cleanedData[key] = String(value);
      return;
    }
    
    // Convert to integer if needed
    if (INTEGER_FIELDS.includes(key) && !isNaN(value)) {
      cleanedData[key] = parseInt(value, 10);
      return;
    }
    
    // Convert to float if needed
    if (NUMERIC_FIELDS.includes(key) && !isNaN(value)) {
      cleanedData[key] = parseFloat(value);
      return;
    }
    
    // Default: keep original value
    cleanedData[key] = value;
  });
  
  return cleanedData;
};

/**
 * Format date for API
 */
export const formatDateForAPI = (date) => {
  if (!date) return null;
  
  if (typeof date === 'string') {
    return date;
  }
  
  if (date instanceof Date) {
    return date.toISOString().split('T')[0];
  }
  
  return null;
};

/**
 * Format datetime for API
 */
export const formatDateTimeForAPI = (datetime) => {
  if (!datetime) return null;
  
  if (typeof datetime === 'string') {
    return datetime;
  }
  
  if (datetime instanceof Date) {
    return datetime.toISOString();
  }
  
  return null;
};

/**
 * Parse API date to Date object
 */
export const parseAPIDate = (dateString) => {
  if (!dateString) return null;
  
  try {
    return new Date(dateString);
  } catch (error) {
    console.error('Error parsing date:', dateString, error);
    return null;
  }
};

/**
 * Format currency
 */
export const formatCurrency = (amount, currency = '₹') => {
  if (amount === null || amount === undefined) {
    return `${currency}0.00`;
  }
  
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount)) {
    return `${currency}0.00`;
  }
  
  return `${currency}${numAmount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
};

/**
 * Format percentage
 */
export const formatPercentage = (value) => {
  if (value === null || value === undefined) {
    return '0%';
  }
  
  const numValue = parseFloat(value);
  if (isNaN(numValue)) {
    return '0%';
  }
  
  return `${numValue.toFixed(2)}%`;
};

/**
 * Sanitize search query
 */
export const sanitizeSearchQuery = (query) => {
  if (!query) return '';
  
  // Remove special characters that might break search
  return query
    .trim()
    .replace(/[<>'"]/g, '')
    .slice(0, 100); // Limit length
};

/**
 * Build query params
 */
export const buildQueryParams = (params) => {
  const cleanParams = {};
  
  Object.keys(params).forEach(key => {
    const value = params[key];
    
    // Skip null, undefined, or empty strings
    if (value === null || value === undefined || value === '') {
      return;
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      if (value.length > 0) {
        cleanParams[key] = value.join(',');
      }
      return;
    }
    
    // Handle dates
    if (value instanceof Date) {
      cleanParams[key] = formatDateForAPI(value);
      return;
    }
    
    // Handle booleans
    if (typeof value === 'boolean') {
      cleanParams[key] = value.toString();
      return;
    }
    
    // Default
    cleanParams[key] = value;
  });
  
  return cleanParams;
};