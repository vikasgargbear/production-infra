/**
 * GST Rates Configuration for Pharmaceutical Products
 * Based on Indian GST regulations for medicines and healthcare products
 */

export const GST_RATES = {
  // Medicine Categories
  MEDICINES: {
    // Life-saving drugs and medicines (Exempt or 5%)
    LIFE_SAVING: 0, // Most life-saving drugs are exempt
    ESSENTIAL_MEDICINES: 5, // Some essential medicines
    
    // Regular medicines
    PATENT_MEDICINES: 12, // Patent or proprietary medicines
    AYURVEDIC_MEDICINES: 12, // Ayurvedic/Herbal medicines
    HOMEOPATHIC_MEDICINES: 12, // Homeopathic medicines
    
    // Medical devices and equipment
    MEDICAL_DEVICES: 18, // Most medical devices
    SURGICAL_INSTRUMENTS: 18, // Surgical instruments
    
    // Cosmetics and personal care (sold through pharmacy)
    COSMETICS: 18, // Cosmetic products
    PERSONAL_CARE: 18 // Personal care items
  },
  
  // Product-specific GST rates
  PRODUCT_SPECIFIC: {
    // Common pharmaceutical products with their HSN codes and GST rates
    'PARACETAMOL': { hsn: '3004', gst: 12 },
    'ASPIRIN': { hsn: '3004', gst: 12 },
    'AMOXICILLIN': { hsn: '3004', gst: 12 },
    'INSULIN': { hsn: '3001', gst: 5 }, // Essential medicine
    'VACCINES': { hsn: '3002', gst: 5 }, // Life-saving
    'VITAMINS': { hsn: '3003', gst: 12 },
    'ANTISEPTIC': { hsn: '3808', gst: 18 },
    'BANDAGES': { hsn: '3005', gst: 12 },
    'SYRINGES': { hsn: '9018', gst: 12 },
    'THERMOMETER': { hsn: '9025', gst: 18 },
    'MASKS': { hsn: '6307', gst: 12 },
    'SANITIZER': { hsn: '3808', gst: 18 }
  },
  
  // HSN Code based rates
  HSN_RATES: {
    '3001': 5,   // Glands and other organs for therapeutic uses
    '3002': 5,   // Human blood, vaccines, toxins, cultures of micro-organisms
    '3003': 12,  // Medicaments consisting of two or more constituents mixed together
    '3004': 12,  // Medicaments consisting of mixed or unmixed products
    '3005': 12,  // Wadding, gauze, bandages and similar articles
    '3006': 12,  // Pharmaceutical goods
    '3808': 18,  // Insecticides, fungicides, herbicides, disinfectants
    '9018': 12,  // Instruments and appliances used in medical sciences
    '9025': 18,  // Hydrometers, thermometers, barometers
    '6307': 12   // Other made-up articles, including dress patterns
  }
};

/**
 * Get GST rate for a product
 * @param {Object} product - Product object
 * @returns {Number} GST rate percentage
 */
export const getProductGSTRate = (product) => {
  // Priority order:
  // 1. Explicit gst_percent from product data
  // 2. Product-specific rate by name
  // 3. HSN code based rate
  // 4. Category based rate
  // 5. Default rate
  
  // 1. Check if product already has GST rate
  if (product.gst_percent && !isNaN(product.gst_percent)) {
    return parseFloat(product.gst_percent);
  }
  
  // 2. Check product-specific rates
  const productName = product.product_name?.toUpperCase() || '';
  for (const [key, value] of Object.entries(GST_RATES.PRODUCT_SPECIFIC)) {
    if (productName.includes(key)) {
      return value.gst;
    }
  }
  
  // 3. Check HSN code based rates
  if (product.hsn_code && GST_RATES.HSN_RATES[product.hsn_code]) {
    return GST_RATES.HSN_RATES[product.hsn_code];
  }
  
  // 4. Check category based rates
  const category = product.category?.toUpperCase() || '';
  if (category.includes('LIFE_SAVING') || category.includes('ESSENTIAL')) {
    return GST_RATES.MEDICINES.ESSENTIAL_MEDICINES;
  }
  if (category.includes('DEVICE') || category.includes('EQUIPMENT')) {
    return GST_RATES.MEDICINES.MEDICAL_DEVICES;
  }
  if (category.includes('COSMETIC')) {
    return GST_RATES.MEDICINES.COSMETICS;
  }
  
  // 5. Default rate for medicines
  return GST_RATES.MEDICINES.PATENT_MEDICINES; // 12%
};

/**
 * Validate if GST rate is correct for given HSN code
 * @param {String} hsnCode - HSN code
 * @param {Number} gstRate - GST rate to validate
 * @returns {Boolean} Is valid
 */
export const validateGSTRate = (hsnCode, gstRate) => {
  if (!hsnCode || !gstRate) return true; // Skip validation if data missing
  
  const expectedRate = GST_RATES.HSN_RATES[hsnCode];
  if (!expectedRate) return true; // Unknown HSN, skip validation
  
  return expectedRate === parseFloat(gstRate);
};

/**
 * Get suggested GST rate based on product information
 * @param {Object} product - Product object
 * @returns {Object} Suggestion with rate and reason
 */
export const suggestGSTRate = (product) => {
  const suggestedRate = getProductGSTRate(product);
  
  let reason = 'Default pharmaceutical rate';
  
  if (product.hsn_code && GST_RATES.HSN_RATES[product.hsn_code]) {
    reason = `Based on HSN code ${product.hsn_code}`;
  } else if (product.product_name) {
    const productName = product.product_name.toUpperCase();
    for (const [key, value] of Object.entries(GST_RATES.PRODUCT_SPECIFIC)) {
      if (productName.includes(key)) {
        reason = `Based on product type: ${key}`;
        break;
      }
    }
  }
  
  return {
    rate: suggestedRate,
    reason: reason,
    isEssential: suggestedRate <= 5,
    requiresApproval: suggestedRate === 0
  };
};

/**
 * Common GST exemptions and special cases
 */
export const GST_EXEMPTIONS = {
  // List of medicines that are completely exempt from GST
  EXEMPT_MEDICINES: [
    'INSULIN',
    'CONTRACEPTIVES',
    'BLOOD_AND_BLOOD_PRODUCTS',
    'ALL_GOODS_FALLING_UNDER_ITC_HS_30'
  ],
  
  // Reduced rate medicines (5%)
  REDUCED_RATE_MEDICINES: [
    'LIFE_SAVING_DRUGS',
    'VACCINES',
    'SERA',
    'DIAGNOSTIC_KITS'
  ]
};

export default {
  GST_RATES,
  getProductGSTRate,
  validateGSTRate,
  suggestGSTRate,
  GST_EXEMPTIONS
};