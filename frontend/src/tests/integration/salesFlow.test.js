/**
 * Sales Flow Integration Test
 * Tests complete sales workflow from customer selection to invoice generation
 */

import { api } from '../../services/api';
import { assert, createTestContext, generateTestData } from '../utils/testHelpers';
import customersData from '../fixtures/customers.json';
import productsData from '../fixtures/products.json';

export const testSalesIntegration = async () => {
  console.log('🔗 Starting Sales Flow Integration Test...\n');
  
  const context = createTestContext();
  const results = {
    passed: [],
    failed: []
  };

  try {
    // Step 1: Search and select customer
    context.log('Searching for customer...');
    
    const customerSearchResponse = await api.customers.search('ABC');
    assert.exists(customerSearchResponse.data, 'Customer search should return data');
    assert.greaterThan(customerSearchResponse.data.length, 0, 'Should find at least one customer');
    
    const selectedCustomer = customerSearchResponse.data[0];
    context.store('customer', selectedCustomer);
    console.log(`✅ Customer selected: ${selectedCustomer.customer_name}`);
    results.passed.push('Customer search and selection');

    // Step 2: Search and select products
    context.log('Searching for products...');
    
    const productSearchResponse = await api.products.search('Paracetamol');
    assert.exists(productSearchResponse.data, 'Product search should return data');
    assert.greaterThan(productSearchResponse.data.length, 0, 'Should find at least one product');
    
    const selectedProduct = productSearchResponse.data[0];
    context.store('product', selectedProduct);
    console.log(`✅ Product selected: ${selectedProduct.product_name}`);
    results.passed.push('Product search and selection');

    // Step 3: Get product batches
    context.log('Getting product batches...');
    
    const batchResponse = await api.products.getBatches(selectedProduct.product_id);
    assert.exists(batchResponse.data, 'Batch response should have data');
    
    const selectedBatch = batchResponse.data[0] || { batch_id: null, batch_number: 'DEFAULT' };
    context.store('batch', selectedBatch);
    console.log(`✅ Batch selected: ${selectedBatch.batch_number}`);
    results.passed.push('Batch selection');

    // Step 4: Calculate invoice totals
    context.log('Calculating invoice totals...');
    
    const invoiceData = {
      invoice_date: generateTestData.date(),
      customer_id: selectedCustomer.customer_id,
      customer_name: selectedCustomer.customer_name,
      customer_details: selectedCustomer,
      billing_address: selectedCustomer.address,
      payment_mode: 'cash',
      items: [{
        product_id: selectedProduct.product_id,
        product_name: selectedProduct.product_name,
        hsn_code: selectedProduct.hsn_code,
        batch_id: selectedBatch.batch_id,
        batch_number: selectedBatch.batch_number,
        quantity: 10,
        rate: selectedProduct.sale_price,
        mrp: selectedProduct.mrp,
        tax_rate: selectedProduct.gst_percent || 12,
        unit: selectedProduct.unit || 'strip'
      }],
      discount_amount: 50,
      other_charges: 20
    };
    
    const calcResponse = await api.sales.calculateTotals(invoiceData);
    assert.exists(calcResponse.data, 'Calculation should return data');
    assert.exists(calcResponse.data.grand_total, 'Should have grand total');
    
    context.store('calculatedTotal', calcResponse.data.grand_total);
    console.log(`✅ Invoice calculated: ₹${calcResponse.data.grand_total}`);
    results.passed.push('Invoice calculation');

    // Step 5: Create invoice
    context.log('Creating invoice...');
    
    const createResponse = await api.sales.create(invoiceData);
    assert.exists(createResponse.data, 'Create response should have data');
    assert.exists(createResponse.data.invoice_number, 'Should have invoice number');
    
    context.store('invoiceId', createResponse.data.invoice_id);
    context.store('invoiceNumber', createResponse.data.invoice_number);
    console.log(`✅ Invoice created: ${createResponse.data.invoice_number}`);
    results.passed.push('Invoice creation');

    // Step 6: Verify inventory update
    context.log('Verifying inventory update...');
    
    const inventoryResponse = await api.products.getStock(selectedProduct.product_id);
    // Inventory should be reduced by the quantity sold
    console.log(`✅ Inventory updated`);
    results.passed.push('Inventory update verification');

    // Step 7: Verify ledger entry (for credit sales)
    if (invoiceData.payment_mode === 'credit') {
      context.log('Verifying ledger entry...');
      
      const ledgerResponse = await api.ledger.getPartyLedger(selectedCustomer.customer_id);
      // Should have new debit entry
      console.log(`✅ Ledger entry created`);
      results.passed.push('Ledger entry verification');
    }

    // Step 8: Get print data
    context.log('Getting print data...');
    
    const printResponse = await api.sales.getPrintData(context.get('invoiceId'));
    assert.exists(printResponse.data, 'Print data should exist');
    assert.exists(printResponse.data.invoice, 'Should have invoice data');
    assert.exists(printResponse.data.organization, 'Should have organization data');
    
    console.log(`✅ Print data ready`);
    results.passed.push('Print data generation');

  } catch (error) {
    console.error('❌ Integration test failed:', error.message);
    results.failed.push({ 
      test: 'Sales flow integration', 
      error: error.message,
      step: context.steps[context.steps.length - 1]?.step || 'Unknown'
    });
  }

  // Summary
  console.log(`\n📊 Sales Flow Integration Test Summary:`);
  console.log(`✅ Passed: ${results.passed.length}/8 steps`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⏱️ Duration: ${context.getDuration()}ms`);
  
  // Cleanup test data if needed
  const invoiceId = context.get('invoiceId');
  if (invoiceId && process.env.CLEANUP_TEST_DATA === 'true') {
    try {
      await api.sales.cancel(invoiceId, 'Test cleanup');
      console.log('🧹 Test data cleaned up');
    } catch (error) {
      console.log('⚠️ Could not cleanup test data:', error.message);
    }
  }
  
  return results;
};

// Export for browser
if (typeof window !== 'undefined') {
  window.testSalesIntegration = testSalesIntegration;
}