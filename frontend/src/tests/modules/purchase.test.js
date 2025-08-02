/**
 * Purchase Module Test Suite
 * Tests for purchase entry functionality
 */

import { api } from '../../services/api';
import { assert, generateTestData, createTestContext } from '../utils/testHelpers';
import { purchaseDataTransformer } from '../../services/api/utils/purchaseDataTransformer';
import suppliersData from '../fixtures/suppliers.json';
import productsData from '../fixtures/products.json';

// Test data
const testPurchaseData = {
  invoice_number: generateTestData.invoiceNumber(),
  invoice_date: generateTestData.date(),
  supplier_id: 1,
  supplier_name: 'Test Supplier',
  items: [
    {
      product_id: 1,
      product_name: 'Paracetamol 500mg',
      batch_number: 'BATCH-TEST-001',
      expiry_date: generateTestData.date(365), // 1 year from now
      quantity: 100,
      purchase_price: 6.00,
      selling_price: 8.50,
      mrp: 10.00,
      tax_percent: 12
    }
  ],
  payment_mode: 'credit',
  payment_status: 'pending',
  notes: 'Test purchase entry'
};

export const testPurchaseModule = async () => {
  console.log('🧪 Starting Purchase Module Test...\n');
  
  const context = createTestContext();
  const results = {
    passed: [],
    failed: []
  };

  // Test 0: Data Transformer
  try {
    context.log('Testing data transformer...');
    
    // Test frontend to backend transformation
    const frontendData = {
      supplier_id: 1,
      invoice_number: 'INV-001',
      invoice_date: '2024-01-01',
      items: [{
        product_id: 1,
        product_name: 'Test Product',
        quantity: 10,
        purchase_price: 100,
        tax_percent: 18
      }]
    };
    
    const transformed = purchaseDataTransformer.transformPurchaseToBackend(frontendData);
    
    assert.equal(transformed.supplier_invoice_number, 'INV-001', 'Should transform invoice_number');
    assert.equal(transformed.items[0].ordered_quantity, 10, 'Should transform quantity');
    assert.equal(transformed.items[0].cost_price, 100, 'Should transform purchase_price');
    
    console.log('✅ Data transformer working correctly');
    results.passed.push('Data transformer');
  } catch (error) {
    console.error('❌ Data transformer failed:', error.message);
    results.failed.push({ test: 'Data transformer', error: error.message });
  }

  // Test 1: Parse PDF Invoice
  try {
    context.log('Testing PDF invoice parsing...');
    
    // Create mock FormData with test PDF
    const formData = new FormData();
    const mockFile = new File(['test content'], 'test-invoice.pdf', { type: 'application/pdf' });
    formData.append('file', mockFile);
    
    const parseResponse = await api.purchases.parseInvoice(formData);
    
    assert.exists(parseResponse.data, 'Parse response should have data');
    console.log('✅ PDF parsing endpoint accessible');
    results.passed.push('PDF invoice parsing');
  } catch (error) {
    console.error('❌ PDF parsing failed:', error.message);
    results.failed.push({ test: 'PDF invoice parsing', error: error.message });
  }

  // Test 2: Create Purchase Entry
  try {
    context.log('Testing purchase creation...');
    
    const createResponse = await api.purchases.create(testPurchaseData);
    
    assert.exists(createResponse.data, 'Create response should have data');
    assert.exists(createResponse.data.purchase_id, 'Should return purchase ID');
    
    context.store('purchaseId', createResponse.data.purchase_id);
    console.log('✅ Purchase created successfully');
    console.log(`   Purchase ID: ${createResponse.data.purchase_id}`);
    results.passed.push('Purchase creation');
  } catch (error) {
    console.error('❌ Purchase creation failed:', error.message);
    results.failed.push({ test: 'Purchase creation', error: error.message });
  }

  // Test 3: Get Purchase Details
  const purchaseId = context.get('purchaseId');
  if (purchaseId) {
    try {
      context.log('Testing purchase retrieval...');
      
      const getResponse = await api.purchases.getById(purchaseId);
      
      assert.exists(getResponse.data, 'Get response should have data');
      assert.equal(getResponse.data.purchase_id, purchaseId, 'Purchase ID should match');
      assert.exists(getResponse.data.items, 'Should have items');
      assert.greaterThan(getResponse.data.items.length, 0, 'Should have at least one item');
      
      console.log('✅ Purchase retrieved successfully');
      console.log(`   Items: ${getResponse.data.items.length}`);
      console.log(`   Total: ₹${getResponse.data.final_amount}`);
      results.passed.push('Purchase retrieval');
    } catch (error) {
      console.error('❌ Purchase retrieval failed:', error.message);
      results.failed.push({ test: 'Purchase retrieval', error: error.message });
    }
  }

  // Test 4: List Purchases
  try {
    context.log('Testing purchase list...');
    
    const listResponse = await api.purchases.getAll({ limit: 5 });
    
    assert.exists(listResponse.data, 'List response should have data');
    assert.exists(listResponse.data.total, 'Should have total count');
    
    console.log('✅ Purchase list retrieved successfully');
    console.log(`   Total purchases: ${listResponse.data.total}`);
    results.passed.push('Purchase list');
  } catch (error) {
    console.error('❌ Purchase list failed:', error.message);
    results.failed.push({ test: 'Purchase list', error: error.message });
  }

  // Test 5: Goods Receipt (if purchase was created)
  if (purchaseId) {
    try {
      context.log('Testing goods receipt...');
      
      const receiptData = {
        items: testPurchaseData.items.map(item => ({
          product_id: item.product_id,
          quantity_received: item.quantity,
          batch_number: item.batch_number,
          expiry_date: item.expiry_date
        }))
      };
      
      const receiptResponse = await api.purchases.receiveGoods(purchaseId, receiptData);
      
      assert.exists(receiptResponse.data, 'Receipt response should have data');
      console.log('✅ Goods receipt processed successfully');
      results.passed.push('Goods receipt');
    } catch (error) {
      console.error('❌ Goods receipt failed:', error.message);
      results.failed.push({ test: 'Goods receipt', error: error.message });
    }
  }

  // Test 6: Pending Receipts
  try {
    context.log('Testing pending receipts...');
    
    const pendingResponse = await api.purchases.getPendingReceipts();
    
    assert.exists(pendingResponse.data, 'Pending response should have data');
    console.log('✅ Pending receipts retrieved');
    console.log(`   Pending count: ${pendingResponse.data.length || 0}`);
    results.passed.push('Pending receipts');
  } catch (error) {
    console.error('❌ Pending receipts failed:', error.message);
    results.failed.push({ test: 'Pending receipts', error: error.message });
  }

  // Summary
  console.log(`\n📊 Purchase Module Test Summary:`);
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⏱️ Duration: ${context.getDuration()}ms`);
  
  return results;
};

// Export for browser
if (typeof window !== 'undefined') {
  window.testPurchaseModule = testPurchaseModule;
}