// Test script to verify PDF functionality
const { printInvoice, downloadInvoicePDF } = require('./src/utils/invoicePdfGenerator');

// Mock invoice data for testing
const testInvoiceData = {
  id: 'INV-001',
  invoice_number: 'INV-001',
  invoice_date: '2024-01-15',
  due_date: '2024-02-15',
  customer: {
    name: 'Test Customer',
    address: '123 Test Street',
    city: 'Test City',
    state: 'Test State',
    pincode: '123456',
    phone: '9876543210',
    email: 'test@example.com'
  },
  items: [
    {
      product_name: 'Test Product 1',
      quantity: 2,
      rate: 100,
      amount: 200,
      tax_rate: 18,
      tax_amount: 36,
      total: 236
    },
    {
      product_name: 'Test Product 2',
      quantity: 1,
      rate: 500,
      amount: 500,
      tax_rate: 18,
      tax_amount: 90,
      total: 590
    }
  ],
  subtotal: 700,
  total_tax: 126,
  total: 826,
  billing_address: '123 Test Street, Test City, Test State - 123456',
  company: {
    name: 'Test Company',
    address: '456 Company Street',
    city: 'Company City',
    state: 'Company State',
    pincode: '654321',
    phone: '1234567890',
    email: 'company@example.com'
  }
};

console.log('Testing PDF functionality...');
console.log('Invoice data:', JSON.stringify(testInvoiceData, null, 2));

// Test if functions exist
console.log('printInvoice function exists:', typeof printInvoice === 'function');
console.log('downloadInvoicePDF function exists:', typeof downloadInvoicePDF === 'function');