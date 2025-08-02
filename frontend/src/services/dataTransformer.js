/**
 * Data Transformer Service
 * Single source of truth for all data transformations
 */

import DateFormatter from './dateFormatter';

class DataTransformer {
  /**
   * Transform product data for different contexts
   */
  static transformProduct(product, context = 'default') {
    const base = {
      product_id: String(product.product_id || product.id || ''),
      product_name: product.product_name || product.name || product.productName || '',
      hsn_code: product.hsn_code || product.hsnCode || '3004',
      gst_percent: parseFloat(product.gst_percent || product.gstPercent || 12),
      mrp: parseFloat(product.mrp || 0),
      sale_price: parseFloat(product.sale_price || product.selling_price || product.rate || product.mrp || 0),
      manufacturer: product.manufacturer || product.company || '',
      category: product.category || '',
      quantity_available: product.quantity_available || product.quantity || product.stock || 0
    };

    switch (context) {
      case 'invoice':
        return {
          ...base,
          // Ensure consistent naming for invoice context
          rate: base.sale_price, // For backward compatibility
        };
      
      case 'batch':
        return {
          ...base,
          // Add batch-specific fields
          requires_batch: product.requires_batch || true,
        };
      
      case 'search':
        return {
          ...base,
          // Minimal fields for search results
          display_name: `${base.product_name} - ₹${base.sale_price}`,
          search_text: `${base.product_name} ${base.hsn_code} ${base.manufacturer}`.toLowerCase()
        };
      
      default:
        return base;
    }
  }

  /**
   * Transform customer data for different contexts
   */
  static transformCustomer(customer, context = 'default') {
    const base = {
      customer_id: String(customer.customer_id || customer.id || ''),
      customer_name: customer.customer_name || customer.name || '',
      primary_phone: customer.primary_phone || customer.phone || customer.mobile || customer.contact || '',
      primary_email: customer.primary_email || customer.email || '',
      // Handle address from both single field and address object
      address: customer.address || (customer.addresses && customer.addresses[0] ? 
        `${customer.addresses[0].address_line1 || ''} ${customer.addresses[0].address_line2 || ''}`.trim() 
        : ''),
      city: customer.city || (customer.addresses && customer.addresses[0] ? customer.addresses[0].city : ''),
      state: customer.state || (customer.addresses && customer.addresses[0] ? customer.addresses[0].state : ''),
      pincode: customer.pincode || customer.pin || (customer.addresses && customer.addresses[0] ? customer.addresses[0].pincode : ''),
      gst_number: customer.gst_number || customer.gstin || customer.gstNumber || '',
      credit_limit: parseFloat(customer.credit_limit || customer.creditLimit || 0),
      credit_days: parseInt(customer.credit_days || customer.creditDays || 0),
      customer_type: customer.customer_type || 'retail'
    };

    switch (context) {
      case 'invoice':
        return {
          ...base,
          // Extract state code from GSTIN
          state_code: base.gst_number ? base.gst_number.substring(0, 2) : null,
          // Format display name
          display_name: base.gst_number ? `${base.customer_name} (GST: ${base.gst_number})` : base.customer_name
        };
      
      case 'search':
        return {
          ...base,
          // Minimal fields for search
          display_name: `${base.customer_name} - ${base.city}`,
          search_text: `${base.customer_name} ${base.phone} ${base.city} ${base.gst_number}`.toLowerCase()
        };
      
      default:
        return base;
    }
  }

  /**
   * Transform batch data
   */
  static transformBatch(batch, product = null) {
    return {
      batch_id: String(batch.batch_id || batch.id || ''),
      batch_number: batch.batch_number || batch.batch_no || batch.batchNumber || '',
      expiry_date: batch.expiry_date || batch.expiryDate || '',
      manufacturing_date: batch.manufacturing_date || batch.mfg_date || batch.mfgDate || '',
      quantity_available: parseInt(batch.quantity_available || batch.quantity || batch.stock || 0),
      mrp: parseFloat(batch.mrp || product?.mrp || 0),
      sale_price: parseFloat(batch.sale_price || batch.selling_price || batch.rate || product?.sale_price || 0),
      purchase_price: parseFloat(batch.purchase_price || batch.cost || 0),
      // Calculate days to expiry
      days_to_expiry: batch.expiry_date ? Math.floor((new Date(batch.expiry_date) - new Date()) / (1000 * 60 * 60 * 24)) : null
    };
  }

  /**
   * Transform invoice data for API submission
   */
  static transformInvoiceForAPI(invoice) {
    return {
      // Order fields
      org_id: invoice.org_id || localStorage.getItem('orgId'),
      customer_id: String(invoice.customer_id),
      order_date: invoice.invoice_date || DateFormatter.getInvoiceDate(),
      
      // Amounts - ensure proper number formatting
      gross_amount: this.formatNumber(invoice.gross_amount),
      discount: this.formatNumber(invoice.discount_amount),
      tax_amount: this.formatNumber(invoice.gst_amount),
      final_amount: this.formatNumber(invoice.net_amount),
      
      // Status fields
      payment_status: invoice.payment_mode === 'CREDIT' ? 'pending' : 'paid',
      status: 'placed',
      payment_mode: invoice.payment_mode || 'CASH',
      delivery_type: invoice.delivery_type || 'PICKUP',
      
      // Optional fields
      ...(invoice.delivery_charges && { delivery_charges: this.formatNumber(invoice.delivery_charges) }),
      ...(invoice.vehicle_number && { vehicle_number: invoice.vehicle_number }),
      ...(invoice.lr_number && { lr_number: invoice.lr_number }),
      ...(invoice.transport_company && { transport_company: invoice.transport_company }),
      
      // Shipping details
      is_same_address: invoice.is_same_address !== false,
      ...(invoice.shipping_contact_name && { shipping_contact_name: invoice.shipping_contact_name }),
      ...(invoice.shipping_address && { shipping_address: invoice.shipping_address }),
      ...(invoice.shipping_phone && { shipping_phone: invoice.shipping_phone }),
      
      // Transform items
      items: invoice.items.map(item => this.transformInvoiceItemForAPI(item))
    };
  }

  /**
   * Transform invoice item for API submission
   */
  static transformInvoiceItemForAPI(item) {
    const quantity = parseInt(item.quantity) || 0;
    const price = this.formatNumber(item.sale_price || item.rate);
    const discountPercent = this.formatNumber(item.discount_percent || 0);
    const taxPercent = this.formatNumber(item.gst_percent || 12);
    
    // Calculate tax amount
    const discountAmount = (price * quantity * discountPercent) / 100;
    const taxableAmount = (price * quantity) - discountAmount;
    const taxAmount = (taxableAmount * taxPercent) / 100;
    
    return {
      product_id: String(item.product_id),
      batch_id: item.batch_id ? String(item.batch_id) : null,
      quantity: quantity,
      price: price,
      discount_percent: discountPercent,
      free_quantity: parseInt(item.free_quantity) || 0,
      gst_percent: taxPercent,
      tax_amount: this.formatNumber(taxAmount),
      // Add backward compatibility fields
      unit_price: price,
      tax_percent: taxPercent
    };
  }

  /**
   * Transform API response to frontend format
   */
  static transformInvoiceFromAPI(apiData) {
    return {
      order_id: apiData.order_id || apiData.id,
      invoice_no: apiData.order_number || apiData.invoice_number || apiData.invoice_no,
      invoice_date: apiData.order_date || apiData.invoice_date,
      customer_id: apiData.customer_id,
      customer_name: apiData.customer_name || apiData.customer?.name,
      customer_details: apiData.customer || {},
      items: (apiData.items || apiData.order_items || []).map(item => ({
        ...item,
        sale_price: item.price || item.unit_price || item.rate,
        quantity: item.quantity,
        gst_percent: item.gst_percent || item.tax_percent || 12,
        discount_percent: item.discount_percent || 0
      })),
      gross_amount: apiData.gross_amount || apiData.subtotal,
      discount_amount: apiData.discount || apiData.discount_amount || 0,
      taxable_amount: apiData.taxable_amount || (apiData.gross_amount - apiData.discount),
      gst_amount: apiData.tax_amount || apiData.gst_amount,
      net_amount: apiData.final_amount || apiData.total_amount,
      payment_mode: apiData.payment_mode,
      delivery_type: apiData.delivery_type,
      gst_type: apiData.gst_type || 'CGST/SGST'
    };
  }

  /**
   * Helper to format numbers consistently
   */
  static formatNumber(value, decimals = 2) {
    const num = parseFloat(value) || 0;
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  /**
   * Transform search results to consistent format
   */
  static transformSearchResults(results, type) {
    if (!Array.isArray(results)) return [];
    
    switch (type) {
      case 'products':
        return results.map(item => this.transformProduct(item, 'search'));
      case 'customers':
        return results.map(item => this.transformCustomer(item, 'search'));
      default:
        return results;
    }
  }

  /**
   * Prepare customer data for API submission
   */
  static prepareCustomerForAPI(customerData) {
    return {
      customer_name: customerData.customer_name,
      primary_phone: customerData.primary_phone,
      primary_email: customerData.primary_email || null,
      customer_type: customerData.customer_type || 'retail',
      gst_number: customerData.gst_number || null,
      pan_number: customerData.pan_number || null,
      drug_license_number: customerData.drug_license_number || null,
      credit_limit: parseFloat(customerData.credit_limit || 0),
      credit_days: parseInt(customerData.credit_days || 0),
      org_id: customerData.org_id,
      // Address as separate object (will be handled by backend)
      address: customerData.address
    };
  }

  /**
   * Prepare product data for API submission
   */
  static prepareProductForAPI(productData) {
    return {
      product_name: productData.product_name,
      product_code: productData.product_code || null,
      manufacturer: productData.manufacturer || null,
      hsn_code: productData.hsn_code || '3004',
      gst_percent: parseFloat(productData.gst_percent || 12),
      mrp: parseFloat(productData.mrp || 0),
      sale_price: parseFloat(productData.sale_price || 0),
      cost_price: parseFloat(productData.cost_price || 0),
      category: productData.category || null,
      salt_composition: productData.salt_composition || null,
      org_id: productData.org_id
    };
  }
}

export default DataTransformer;