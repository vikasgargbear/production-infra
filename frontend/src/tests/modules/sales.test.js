/**
 * Sales Module Connectivity Test
 * Tests the complete flow from frontend to backend
 */

import { api } from '../services/api';

// Test data
const testInvoiceData = {
  invoice_date: new Date().toISOString().split('T')[0],
  customer_id: 1,
  customer_name: 'Test Customer',
  customer_details: {
    gst_number: '27AAAAA0000A1Z5',
    phone: '9876543210',
    state_code: '27'
  },
  billing_address: '123 Test Street, Mumbai',
  shipping_address: '123 Test Street, Mumbai',
  payment_mode: 'cash',
  items: [
    {
      product_id: 1,
      product_name: 'Test Product',
      hsn_code: '3004',
      quantity: 10,
      rate: 100,
      mrp: 120,
      tax_rate: 18,
      unit: 'strip'
    }
  ],
  discount_amount: 50,
  other_charges: 20,
  notes: 'Test invoice'
};

export const testSalesModule = async () => {
  console.log('🧪 Starting Sales Module Connectivity Test...\n');
  
  const results = {
    passed: [],
    failed: []
  };

  // Test 1: Calculate sale totals
  try {
    console.log('📊 Test 1: Testing sale calculation...');
    const calcResponse = await api.sales.calculateTotals(testInvoiceData);
    
    if (calcResponse.data && calcResponse.data.grand_total) {
      console.log('✅ Sale calculation successful');
      console.log(`   Subtotal: ₹${calcResponse.data.subtotal}`);
      console.log(`   Tax: ₹${calcResponse.data.total_tax}`);
      console.log(`   Total: ₹${calcResponse.data.grand_total}`);
      results.passed.push('Sale calculation');
    } else {
      throw new Error('Invalid calculation response');
    }
  } catch (error) {
    console.error('❌ Sale calculation failed:', error.message);
    results.failed.push({ test: 'Sale calculation', error: error.message });
  }

  // Test 2: Create sale
  try {
    console.log('\n💾 Test 2: Testing sale creation...');
    const createResponse = await api.sales.create(testInvoiceData);
    
    if (createResponse.data && createResponse.data.invoice_number) {
      console.log('✅ Sale created successfully');
      console.log(`   Invoice Number: ${createResponse.data.invoice_number}`);
      console.log(`   Total Amount: ₹${createResponse.data.total_amount}`);
      results.passed.push('Sale creation');
      
      // Store for further tests
      results.saleId = createResponse.data.invoice_id;
      results.invoiceNumber = createResponse.data.invoice_number;
    } else {
      throw new Error('Invalid create response');
    }
  } catch (error) {
    console.error('❌ Sale creation failed:', error.message);
    results.failed.push({ test: 'Sale creation', error: error.message });
  }

  // Test 3: Get sale by ID
  if (results.saleId) {
    try {
      console.log('\n🔍 Test 3: Testing sale retrieval...');
      const getResponse = await api.sales.getById(results.saleId);
      
      if (getResponse.data) {
        console.log('✅ Sale retrieved successfully');
        console.log(`   Items: ${getResponse.data.items?.length || 0}`);
        results.passed.push('Sale retrieval');
      } else {
        throw new Error('Invalid get response');
      }
    } catch (error) {
      console.error('❌ Sale retrieval failed:', error.message);
      results.failed.push({ test: 'Sale retrieval', error: error.message });
    }
  }

  // Test 4: Get print data
  if (results.saleId) {
    try {
      console.log('\n🖨️ Test 4: Testing print data...');
      const printResponse = await api.sales.getPrintData(results.saleId);
      
      if (printResponse.data && printResponse.data.invoice) {
        console.log('✅ Print data retrieved successfully');
        results.passed.push('Print data');
      } else {
        throw new Error('Invalid print response');
      }
    } catch (error) {
      console.error('❌ Print data failed:', error.message);
      results.failed.push({ test: 'Print data', error: error.message });
    }
  }

  // Test 5: List sales
  try {
    console.log('\n📋 Test 5: Testing sales list...');
    const listResponse = await api.sales.getAll({ limit: 5 });
    
    if (listResponse.data) {
      console.log('✅ Sales list retrieved successfully');
      console.log(`   Total sales: ${listResponse.data.total || 0}`);
      results.passed.push('Sales list');
    } else {
      throw new Error('Invalid list response');
    }
  } catch (error) {
    console.error('❌ Sales list failed:', error.message);
    results.failed.push({ test: 'Sales list', error: error.message });
  }

  // Summary
  console.log('\n📊 Test Summary:');
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  
  if (results.passed.length > 0) {
    console.log('\nPassed tests:');
    results.passed.forEach(test => console.log(`  ✓ ${test}`));
  }
  
  if (results.failed.length > 0) {
    console.log('\nFailed tests:');
    results.failed.forEach(({ test, error }) => console.log(`  ✗ ${test}: ${error}`));
  }
  
  return results;
};

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.testSalesModule = testSalesModule;
}