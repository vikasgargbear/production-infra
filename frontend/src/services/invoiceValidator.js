/**
 * Invoice Validator Service
 * Single source of truth for all invoice validations
 */

class InvoiceValidator {
  /**
   * Validate entire invoice before submission
   * @param {Object} invoice - Invoice object
   * @returns {Object} { isValid: boolean, errors: [] }
   */
  static validateInvoice(invoice) {
    const errors = [];

    // Customer validation
    if (!invoice.customer_id) {
      errors.push({ field: 'customer_id', message: 'Please select a customer' });
    }

    // Items validation
    if (!invoice.items || invoice.items.length === 0) {
      errors.push({ field: 'items', message: 'Please add at least one item' });
    } else {
      // Validate each item
      invoice.items.forEach((item, index) => {
        const itemErrors = this.validateInvoiceItem(item);
        itemErrors.forEach(error => {
          errors.push({
            field: `items[${index}].${error.field}`,
            message: error.message,
            index
          });
        });
      });
    }

    // Amount validation
    if (!invoice.net_amount || invoice.net_amount === 0) {
      errors.push({ field: 'net_amount', message: 'Invoice amount cannot be zero' });
    }

    // Delivery type validation
    if (!invoice.delivery_type) {
      errors.push({ field: 'delivery_type', message: 'Please select delivery type' });
    }

    // Payment mode validation
    if (!invoice.payment_mode) {
      errors.push({ field: 'payment_mode', message: 'Please select payment mode' });
    }

    // Date validation
    if (!invoice.invoice_date) {
      errors.push({ field: 'invoice_date', message: 'Invoice date is required' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate individual invoice item
   * @param {Object} item - Invoice item
   * @returns {Array} Array of errors
   */
  static validateInvoiceItem(item) {
    const errors = [];

    if (!item.product_id) {
      errors.push({ field: 'product_id', message: 'Product is required' });
    }

    if (!item.batch_id) {
      errors.push({ field: 'batch_id', message: 'Batch selection is required' });
    }

    if (!item.quantity || item.quantity < 1) {
      errors.push({ field: 'quantity', message: 'Quantity must be at least 1' });
    }

    if (item.available_quantity && item.quantity > item.available_quantity) {
      errors.push({ field: 'quantity', message: `Quantity exceeds available stock (${item.available_quantity})` });
    }

    if (item.discount_percent < 0 || item.discount_percent > 100) {
      errors.push({ field: 'discount_percent', message: 'Discount must be between 0 and 100' });
    }

    if (!item.sale_price && !item.rate) {
      errors.push({ field: 'sale_price', message: 'Price is required' });
    }

    return errors;
  }

  /**
   * Validate customer data
   * @param {Object} customer - Customer object
   * @returns {Object} { isValid: boolean, errors: [] }
   */
  static validateCustomer(customer) {
    const errors = [];

    if (!customer.customer_name) {
      errors.push({ field: 'customer_name', message: 'Customer name is required' });
    }

    if (!customer.phone || !/^\d{10}$/.test(customer.phone)) {
      errors.push({ field: 'phone', message: 'Valid 10-digit phone number is required' });
    }

    if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
      errors.push({ field: 'email', message: 'Invalid email address' });
    }

    if (customer.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(customer.gst_number)) {
      errors.push({ field: 'gst_number', message: 'Invalid GST number format' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate product data
   * @param {Object} product - Product object
   * @returns {Object} { isValid: boolean, errors: [] }
   */
  static validateProduct(product) {
    const errors = [];

    if (!product.product_name) {
      errors.push({ field: 'product_name', message: 'Product name is required' });
    }

    if (!product.hsn_code || !/^\d{4,8}$/.test(product.hsn_code)) {
      errors.push({ field: 'hsn_code', message: 'Valid HSN code is required (4-8 digits)' });
    }

    if (!product.gst_percent || product.gst_percent < 0 || product.gst_percent > 100) {
      errors.push({ field: 'gst_percent', message: 'GST percentage must be between 0 and 100' });
    }

    if (!product.mrp || product.mrp <= 0) {
      errors.push({ field: 'mrp', message: 'MRP must be greater than 0' });
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Format validation errors for display
   * @param {Array} errors - Array of error objects
   * @returns {String} Formatted error message
   */
  static formatErrors(errors) {
    if (!errors || errors.length === 0) return '';
    
    return errors
      .map(error => `${error.field}: ${error.message}`)
      .join('\n');
  }
}

export default InvoiceValidator;