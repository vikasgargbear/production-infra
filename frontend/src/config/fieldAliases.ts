/**
 * FIELD ALIASES - Single Source of Truth for Variable Naming
 * 
 * This file defines the canonical (backend) names for all fields and their legacy aliases.
 * Use this file for:
 * 1. Looking up what the correct canonical name is
 * 2. Providing fallbacks when reading data that might use legacy names
 * 3. Gradually removing aliases as the codebase is updated
 * 
 * MIGRATION GUIDE:
 * 1. When updating code, always use the canonical name
 * 2. Before removing an alias, search codebase: grep -r "aliasName" frontend/src
 * 3. Update all occurrences to canonical name
 * 4. Remove the alias from this file
 * 5. Test thoroughly
 * 
 * Format: canonicalName: [legacyAlias1, legacyAlias2, ...]
 * The canonical name is the backend/database column name
 */

// =============================================================================
// ITEM-LEVEL FIELDS (Invoice/Order Line Items)
// =============================================================================

export const ITEM_FIELD_ALIASES = {
    // Pricing
    unit_price: ['sale_price', 'rate', 'selling_price', 'price'],
    discount_percent: ['discount', 'disc', 'discountPercent'],
    gst_percent: ['tax', 'tax_rate', 'tax_percent', 'gstPercent', 'gst_rate'],

    // Identity
    product_id: ['productId'],
    product_name: ['name', 'productName', 'product'],
    product_code: ['code', 'productCode', 'sku'],
    batch_id: ['batchId'],
    batch_number: ['batch', 'batch_no', 'batchNo', 'batchNumber'],

    // Quantities
    quantity: ['qty'],
    free_quantity: ['free', 'freeQty', 'bonus_quantity'],
    quantity_available: ['available', 'qty_available', 'availableQty', 'available_quantity'],

    // Calculated fields (read-only, calculated by backend/calculator)
    line_total: ['total', 'itemTotal', 'calculated_total', 'total_amount', 'lineTotal'],
    taxable_amount: ['taxable', 'taxableAmount'],
    cgst_amount: ['cgst', 'cgstAmount'],
    sgst_amount: ['sgst', 'sgstAmount'],
    igst_amount: ['igst', 'igstAmount'],

    // Dates
    expiry_date: ['expiry', 'expiryDate', 'exp_date'],
    manufacturing_date: ['mfg_date', 'mfgDate', 'manufacturingDate'],
};

// =============================================================================
// INVOICE-LEVEL FIELDS
// =============================================================================

export const INVOICE_FIELD_ALIASES = {
    // Identity
    invoice_number: ['invoice_no', 'invoiceNo', 'invoiceNumber', 'inv_no'],
    invoice_id: ['invoiceId', 'id'],

    // Dates
    invoice_date: ['date', 'invoiceDate', 'created_at'],
    due_date: ['dueDate', 'payment_due'],

    // Amounts
    gross_amount: ['grossAmount', 'subtotal', 'sub_total'],
    discount_amount: ['discountAmount', 'total_discount'],
    taxable_amount: ['taxableAmount', 'net_taxable'],
    tax_amount: ['taxAmount', 'total_tax', 'gst_amount'],
    freight_charges: ['delivery_charges', 'deliveryCharges', 'shipping_charges'],
    final_amount: ['net_amount', 'netAmount', 'totalAmount', 'total', 'grand_total'],

    // GST
    cgst_amount: ['cgst', 'cgstAmount', 'cgst_total'],
    sgst_amount: ['sgst', 'sgstAmount', 'sgst_total'],
    igst_amount: ['igst', 'igstAmount', 'igst_total'],
    gst_type: ['gstType', 'tax_type'],

    // E-Invoice/E-Way Bill
    e_way_bill_number: ['eway_bill_number', 'ewayBillNumber', 'ewaybill'],
    e_invoice_number: ['irn', 'e_invoice'],
    ack_number: ['ack_no', 'ackNo', 'acknowledgement_number'],

    // Customer
    customer_id: ['customerId'],
    customer_name: ['customerName', 'customer'],

    // Addresses
    billing_address: ['billingAddress', 'bill_address'],
    shipping_address: ['shippingAddress', 'ship_address', 'delivery_address'],
};

// =============================================================================
// CUSTOMER FIELDS
// =============================================================================

export const CUSTOMER_FIELD_ALIASES = {
    customer_id: ['id', 'customerId'],
    customer_name: ['name', 'customerName', 'full_name'],
    gst_number: ['gst', 'gstin', 'gst_no', 'gstNumber', 'gstNo'],
    primary_phone: ['phone', 'mobile', 'contact', 'phone_number'],
    primary_email: ['email', 'emailAddress'],
    state: ['state', 'stateName'],
    state_code: ['stateCode'],
};

// =============================================================================
// PRODUCT FIELDS
// =============================================================================

export const PRODUCT_FIELD_ALIASES = {
    product_id: ['id', 'productId'],
    product_name: ['name', 'productName', 'title'],
    product_code: ['code', 'productCode', 'sku', 'item_code'],
    gst_percent: ['tax', 'gst', 'tax_rate', 'gstPercent', 'tax_percent'],
    hsn_code: ['hsn', 'hsnCode', 'hsn_sac'],
    unit_price: ['sale_price', 'selling_price', 'rate', 'price'],
};

// =============================================================================
// COMBINED ALIASES (All fields for easy lookup)
// =============================================================================

export const ALL_FIELD_ALIASES = {
    ...ITEM_FIELD_ALIASES,
    ...INVOICE_FIELD_ALIASES,
    ...CUSTOMER_FIELD_ALIASES,
    ...PRODUCT_FIELD_ALIASES,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get a field value using canonical name with fallbacks to aliases
 * @param {object} obj - The object to read from
 * @param {string} canonicalName - The canonical field name
 * @param {any} defaultValue - Default value if not found
 * @returns {any} The field value
 */
export const getField = (obj, canonicalName, defaultValue = undefined) => {
    if (!obj) return defaultValue;

    // Try canonical name first
    if (obj[canonicalName] !== undefined) return obj[canonicalName];

    // Try aliases
    const aliases = ALL_FIELD_ALIASES[canonicalName] || [];
    for (const alias of aliases) {
        if (obj[alias] !== undefined) return obj[alias];
    }

    return defaultValue;
};

/**
 * Get a numeric field value with fallbacks
 * @param {object} obj - The object to read from
 * @param {string} canonicalName - The canonical field name
 * @param {number} defaultValue - Default value if not found
 * @returns {number} The parsed numeric value
 */
export const getNumericField = (obj, canonicalName, defaultValue = 0) => {
    const value = getField(obj, canonicalName);
    if (value === undefined || value === null || value === '') return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Normalize an object to use only canonical field names
 * Legacy aliases are mapped to their canonical names
 * @param {object} obj - The object to normalize
 * @param {object} aliasMap - The alias map to use (defaults to ALL_FIELD_ALIASES)
 * @returns {object} Normalized object with canonical names
 */
export const normalizeToCanonical = (obj, aliasMap = ALL_FIELD_ALIASES) => {
    if (!obj) return obj;

    const normalized = { ...obj };

    for (const [canonical, aliases] of Object.entries(aliasMap)) {
        // If canonical already exists, skip
        if (normalized[canonical] !== undefined) continue;

        // Check each alias
        for (const alias of aliases) {
            if (obj[alias] !== undefined) {
                normalized[canonical] = obj[alias];
                break;
            }
        }
    }

    return normalized;
};

/**
 * Create API payload with only canonical names (no aliases)
 * Use this when sending data to backend
 * @param {object} obj - The object to clean
 * @param {string[]} canonicalFields - List of canonical fields to include
 * @returns {object} Clean object with only canonical names
 */
export const toCanonicalPayload = (obj, canonicalFields) => {
    const payload = {};

    for (const field of canonicalFields) {
        const value = getField(obj, field);
        if (value !== undefined) {
            payload[field] = value;
        }
    }

    return payload;
};

// =============================================================================
// MIGRATION TRACKING
// =============================================================================

/**
 * Track which aliases have been removed
 * When an alias is fully migrated, add it here for documentation
 */
export const REMOVED_ALIASES = {
    // Format: canonicalName: [removedAlias1, removedAlias2, ...]
    // Example: unit_price: ['sale_price'],  // Removed 2024-01-15
};

/**
 * Get list of aliases still in use for a field
 * Use this when debugging to see what aliases need migration
 */
export const getActiveAliases = (canonicalName) => {
    const all = ALL_FIELD_ALIASES[canonicalName] || [];
    const removed = REMOVED_ALIASES[canonicalName] || [];
    return all.filter(alias => !removed.includes(alias));
};

export default {
    ITEM_FIELD_ALIASES,
    INVOICE_FIELD_ALIASES,
    CUSTOMER_FIELD_ALIASES,
    PRODUCT_FIELD_ALIASES,
    ALL_FIELD_ALIASES,
    getField,
    getNumericField,
    normalizeToCanonical,
    toCanonicalPayload,
    REMOVED_ALIASES,
    getActiveAliases,
};
