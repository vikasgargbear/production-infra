/**
 * Comprehensive test for invoice saving functionality
 * Tests all required fields and validation rules
 */

// Mock invoice data for testing
const getMockInvoice = () => ({
  invoice_no: 'INV-2025-0001',
  invoice_date: new Date().toISOString().split('T')[0],
  customer_id: 1,
  customer_name: 'Test Customer',
  billing_address: '123 Test Street, Test City',
  shipping_address: '123 Test Street, Test City',
  payment_mode: 'cash',
  delivery_type: 'PICKUP',
  delivery_charges: 0,
  discount_amount: 0,
  notes: 'Test invoice',
  items: [
    {
      product_id: 1,
      product_name: 'Test Product',
      batch_id: 1,
      quantity: 10,
      rate: 100,
      sale_price: 100,
      gst_percent: 12,
      tax_rate: 12,
      discount_percent: 0,
      tax_amount: 120
    }
  ],
  gross_amount: 1000,
  tax_amount: 120,
  net_amount: 1120
});

// Mock customer data
const getMockCustomer = () => ({
  customer_id: 1,
  customer_name: 'Test Customer',
  phone: '9876543210',
  gst_number: '24AAAAA0000A1Z5'
});

// Validation test cases
const testCases = [
  {
    name: 'Valid invoice',
    invoice: getMockInvoice(),
    customer: getMockCustomer(),
    shouldPass: true
  },
  {
    name: 'Missing customer_id',
    invoice: { ...getMockInvoice(), customer_id: null },
    customer: getMockCustomer(),
    shouldPass: false,
    expectedError: 'customer_id'
  },
  {
    name: 'Empty items array',
    invoice: { ...getMockInvoice(), items: [] },
    customer: getMockCustomer(),
    shouldPass: false,
    expectedError: 'items'
  },
  {
    name: 'Invalid payment_mode',
    invoice: { ...getMockInvoice(), payment_mode: 'invalid' },
    customer: getMockCustomer(),
    shouldPass: false,
    expectedError: 'payment_terms'
  },
  {
    name: 'Invalid phone number',
    invoice: getMockInvoice(),
    customer: { ...getMockCustomer(), phone: '123' },
    shouldPass: false,
    expectedError: 'shipping_phone'
  },
  {
    name: 'Missing product_id in item',
    invoice: {
      ...getMockInvoice(),
      items: [{
        ...getMockInvoice().items[0],
        product_id: null
      }]
    },
    customer: getMockCustomer(),
    shouldPass: false,
    expectedError: 'product_id'
  },
  {
    name: 'Invalid quantity (string)',
    invoice: {
      ...getMockInvoice(),
      items: [{
        ...getMockInvoice().items[0],
        quantity: 'abc'
      }]
    },
    customer: getMockCustomer(),
    shouldPass: false,
    expectedError: 'quantity'
  },
  {
    name: 'Missing tax_percent',
    invoice: {
      ...getMockInvoice(),
      items: [{
        ...getMockInvoice().items[0],
        gst_percent: null,
        tax_rate: null
      }]
    },
    customer: getMockCustomer(),
    shouldPass: false,
    expectedError: 'tax_percent'
  }
];

// Function to build invoice payload (matches handleSaveInvoice logic)
const buildInvoicePayload = (invoice, customer, orgId = 'ad808530-1ddb-4377-ab20-67bef145d80d') => {
  const paymentTermsMap = {
    'cash': 'cash',
    'credit': 'credit',
    'advance': 'advance'
  };
  
  return {
    org_id: orgId,
    customer_id: parseInt(invoice.customer_id),
    order_date: invoice.invoice_date,
    order_type: 'sales',
    payment_terms: paymentTermsMap[invoice.payment_mode?.toLowerCase()] || 'cash',
    billing_name: invoice.customer_name || customer?.customer_name,
    billing_address: invoice.billing_address || '',
    billing_gstin: customer?.gst_number || null,
    shipping_name: invoice.customer_name || customer?.customer_name,
    shipping_address: invoice.shipping_address || invoice.billing_address || '',
    shipping_phone: customer?.phone ? customer.phone.replace(/\D/g, '').slice(-10) : null,
    discount_percent: 0,
    discount_amount: parseFloat(invoice.discount_amount) || 0,
    delivery_charges: parseFloat(invoice.delivery_charges) || 0,
    other_charges: 0,
    notes: invoice.notes || '',
    items: invoice.items.map(item => ({
      product_id: parseInt(item.product_id),
      batch_id: item.batch_id ? parseInt(item.batch_id) : null,
      quantity: parseInt(item.quantity) || 1,
      unit_price: parseFloat(item.rate) || parseFloat(item.sale_price) || 0,
      discount_percent: parseFloat(item.discount_percent) || 0,
      discount_amount: 0,
      tax_percent: parseFloat(item.gst_percent) || parseFloat(item.tax_rate) || 12,
      tax_amount: parseFloat(item.tax_amount) || 0
    }))
  };
};

// Run tests
export const runInvoiceSaveTests = () => {
  console.log('Running invoice save tests...\n');
  
  const results = testCases.map(test => {
    try {
      const payload = buildInvoicePayload(test.invoice, test.customer);
      
      // Log payload for debugging
      console.log(`Test: ${test.name}`);
      console.log('Payload:', JSON.stringify(payload, null, 2));
      
      // Basic validation checks
      const errors = [];
      
      // Check required fields
      if (!payload.org_id) errors.push('org_id is required');
      if (!payload.customer_id || isNaN(payload.customer_id)) errors.push('customer_id must be a valid number');
      if (!payload.order_date) errors.push('order_date is required');
      if (!payload.items || payload.items.length === 0) errors.push('At least one item is required');
      
      // Check payment terms
      if (!['cash', 'credit', 'advance'].includes(payload.payment_terms)) {
        errors.push('payment_terms must be cash, credit, or advance');
      }
      
      // Check phone format
      if (payload.shipping_phone && payload.shipping_phone.length !== 10) {
        errors.push('shipping_phone must be 10 digits');
      }
      
      // Check items
      payload.items.forEach((item, index) => {
        if (!item.product_id || isNaN(item.product_id)) {
          errors.push(`Item ${index}: product_id must be a valid number`);
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push(`Item ${index}: quantity must be greater than 0`);
        }
        if (isNaN(item.unit_price)) {
          errors.push(`Item ${index}: unit_price must be a valid number`);
        }
        if (isNaN(item.tax_percent)) {
          errors.push(`Item ${index}: tax_percent must be a valid number`);
        }
      });
      
      const passed = errors.length === 0;
      
      console.log(`Result: ${passed ? 'PASS' : 'FAIL'}`);
      if (errors.length > 0) {
        console.log('Errors:', errors);
      }
      console.log('---\n');
      
      return {
        test: test.name,
        passed,
        errors,
        expectedToPass: test.shouldPass,
        success: passed === test.shouldPass
      };
    } catch (error) {
      console.log(`Test: ${test.name}`);
      console.log(`Result: ERROR - ${error.message}`);
      console.log('---\n');
      
      return {
        test: test.name,
        passed: false,
        error: error.message,
        expectedToPass: test.shouldPass,
        success: false === test.shouldPass
      };
    }
  });
  
  // Summary
  const successCount = results.filter(r => r.success).length;
  console.log(`\nTest Summary: ${successCount}/${results.length} tests passed`);
  
  return results;
};

// Export for use in console
window.runInvoiceSaveTests = runInvoiceSaveTests;