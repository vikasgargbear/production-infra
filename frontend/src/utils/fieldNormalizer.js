/**
 * Field Normalizer Utility
 * Single source of truth for field name standardization
 * Handles all the chaos of multiple field names for same data
 */

/**
 * Normalize GST percentage field
 * Maps all variations to standard 'gst_percent'
 */
export const normalizeGSTPercent = (data) => {
  // Check all possible field names in order of preference
  const gstValue = parseFloat(
    data.gst_percent ||      // Our standard
    data.tax_percent ||      // Backend common
    data.tax_rate ||         // Invoice imports
    data.gst_percentage ||   // Database field
    data.tax_percentage ||   // Legacy
    data.gst_rate ||         // Some APIs
    0
  );
  
  return gstValue;
};

/**
 * Normalize GST number/GSTIN
 * Maps all variations to standard 'gst_number'
 */
export const normalizeGSTNumber = (data) => {
  return data.gst_number || 
         data.gstin || 
         data.gstNumber || 
         data.GSTIN || 
         '';
};

/**
 * Normalize CGST/SGST/IGST amounts
 */
export const normalizeGSTAmounts = (data) => {
  return {
    cgst_amount: parseFloat(data.cgst_amount || data.cgstAmount || data.cgst || data.cgst_value || 0),
    sgst_amount: parseFloat(data.sgst_amount || data.sgstAmount || data.sgst || data.sgst_value || 0),
    igst_amount: parseFloat(data.igst_amount || data.igstAmount || data.igst || data.igst_value || 0)
  };
};

/**
 * Normalize CGST/SGST/IGST percentages
 */
export const normalizeGSTPercentages = (data) => {
  const gstPercent = normalizeGSTPercent(data);
  const gstType = data.gst_type || 'CGST/SGST';
  
  return {
    cgst_percent: parseFloat(data.cgst_percent || data.cgstPercent || data.cgst_rate || 
                            (gstType === 'CGST/SGST' ? gstPercent/2 : 0)),
    sgst_percent: parseFloat(data.sgst_percent || data.sgstPercent || data.sgst_rate || 
                            (gstType === 'CGST/SGST' ? gstPercent/2 : 0)),
    igst_percent: parseFloat(data.igst_percent || data.igstPercent || data.igst_rate || 
                            (gstType === 'IGST' ? gstPercent : 0))
  };
};

/**
 * Normalize all GST fields in an object
 * This is the main function to use
 */
export const normalizeGSTFields = (data) => {
  if (!data) return data;
  
  const gstPercent = normalizeGSTPercent(data);
  const gstAmounts = normalizeGSTAmounts(data);
  const gstPercentages = normalizeGSTPercentages(data);
  
  return {
    ...data,
    // Standard field names
    gst_percent: gstPercent,
    gst_number: normalizeGSTNumber(data),
    gst_type: data.gst_type || 'CGST/SGST',
    
    // Amounts
    ...gstAmounts,
    
    // Percentages
    ...gstPercentages,
    
    // Total GST amount (calculated)
    total_gst: gstAmounts.cgst_amount + gstAmounts.sgst_amount + gstAmounts.igst_amount,
    
    // Remove legacy fields to avoid confusion (optional)
    // Uncomment these lines when ready to fully migrate
    // tax_percent: undefined,
    // tax_rate: undefined,
    // tax_percentage: undefined,
    // gst_percentage: undefined,
    // gst_rate: undefined
  };
};

/**
 * Normalize array of items (for invoice items, etc.)
 */
export const normalizeItemsGST = (items) => {
  if (!Array.isArray(items)) return items;
  return items.map(item => normalizeGSTFields(item));
};

/**
 * Check if GST is present and valid
 */
export const hasValidGST = (data) => {
  const gstPercent = normalizeGSTPercent(data);
  return gstPercent > 0;
};

/**
 * Get GST display string
 */
export const getGSTDisplay = (data) => {
  const gstPercent = normalizeGSTPercent(data);
  if (!gstPercent || gstPercent === 0) {
    return 'GST not set';
  }
  return `${gstPercent}%`;
};

/**
 * Calculate GST breakdown based on type
 */
export const calculateGSTBreakdown = (amount, gstPercent, gstType = 'CGST/SGST') => {
  const gstAmount = (amount * gstPercent) / 100;
  
  if (gstType === 'IGST') {
    return {
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: gstAmount,
      cgst_percent: 0,
      sgst_percent: 0,
      igst_percent: gstPercent,
      total_gst: gstAmount
    };
  } else {
    // CGST/SGST
    return {
      cgst_amount: gstAmount / 2,
      sgst_amount: gstAmount / 2,
      igst_amount: 0,
      cgst_percent: gstPercent / 2,
      sgst_percent: gstPercent / 2,
      igst_percent: 0,
      total_gst: gstAmount
    };
  }
};

export default {
  normalizeGSTFields,
  normalizeItemsGST,
  normalizeGSTPercent,
  normalizeGSTNumber,
  normalizeGSTAmounts,
  normalizeGSTPercentages,
  hasValidGST,
  getGSTDisplay,
  calculateGSTBreakdown
};