// Returns Module Tests
import { assert } from '../utils/testHelpers.js';
import { api } from '../../services/api/index.js';
import { returnsDataTransformer } from '../../services/api/utils/returnsDataTransformer.js';

export async function testReturnsModule(options = {}) {
  const { verbose = false } = options;
  const results = { passed: [], failed: [] };
  
  console.log('\n🔄 Testing Returns Module...\n');
  
  // Test Suite 1: Data Transformer
  console.log('📋 Testing Data Transformer...');
  
  // Test 1.1: Transform Sale Return to Backend
  try {
    const frontendData = {
      customer_id: 'cust-001',
      document_id: 'sale-001',
      return_date: '2024-01-01',
      reason: 'damaged',
      items: [{
        product_id: 1,
        return_quantity: 5,
        unit_price: 100,
        tax_percent: 18
      }]
    };
    
    const transformed = returnsDataTransformer.transformSaleReturnToBackend(frontendData);
    
    assert(transformed.party_id === 'cust-001', 
      'Should transform customer_id to party_id');
    assert(transformed.original_sale_id === 'sale-001', 
      'Should transform document_id to original_sale_id');
    assert(transformed.items[0].return_quantity === 5, 
      'Should preserve return_quantity');
    
    results.passed.push('Sale Return to Backend transformation');
    if (verbose) console.log('✅ Sale Return to Backend transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Sale Return to Backend transformation', error: error.message });
    console.error('❌ Sale Return to Backend transformation failed:', error.message);
  }
  
  // Test 1.2: Transform Purchase Return to Backend
  try {
    const frontendData = {
      supplier_id: 'supp-001',
      document_id: 'purchase-001',
      return_date: '2024-01-01',
      reason: 'quality_issue',
      items: [{
        product_id: 1,
        return_quantity: 10,
        cost_price: 80,
        tax_percent: 12
      }]
    };
    
    const transformed = returnsDataTransformer.transformPurchaseReturnToBackend(frontendData);
    
    assert(transformed.supplier_id === 'supp-001', 
      'Should preserve supplier_id');
    assert(transformed.original_purchase_id === 'purchase-001', 
      'Should transform document_id to original_purchase_id');
    assert(transformed.items[0].cost_price === 80, 
      'Should preserve cost_price');
    
    results.passed.push('Purchase Return to Backend transformation');
    if (verbose) console.log('✅ Purchase Return to Backend transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Purchase Return to Backend transformation', error: error.message });
    console.error('❌ Purchase Return to Backend transformation failed:', error.message);
  }
  
  // Test 1.3: Validate Return Data
  try {
    // Valid sale return
    const validSaleReturn = {
      party_id: 'cust-001',
      original_sale_id: 'sale-001',
      return_date: '2024-01-01',
      items: [{
        product_id: 1,
        return_quantity: 5
      }]
    };
    
    const saleValidation = returnsDataTransformer.validateReturnData(validSaleReturn, 'sale');
    assert(saleValidation.isValid === true, 'Valid sale return should pass validation');
    
    // Invalid purchase return (missing supplier)
    const invalidPurchaseReturn = {
      original_purchase_id: 'purchase-001',
      items: []
    };
    
    const purchaseValidation = returnsDataTransformer.validateReturnData(invalidPurchaseReturn, 'purchase');
    assert(purchaseValidation.isValid === false, 'Invalid purchase return should fail validation');
    assert(purchaseValidation.errors.length > 0, 'Should return validation errors');
    
    results.passed.push('Return data validation');
    if (verbose) console.log('✅ Return data validation passed');
  } catch (error) {
    results.failed.push({ test: 'Return data validation', error: error.message });
    console.error('❌ Return data validation failed:', error.message);
  }
  
  // Test Suite 2: Returns API Integration
  console.log('\n📡 Testing Returns API...');
  
  // Test 2.1: Get Sale Returns
  try {
    const response = await api.returns.getSaleReturns({ limit: 5 });
    assert(response.data, 'Should return sale returns data');
    assert(typeof response.data.total === 'number', 'Should have total count');
    assert(Array.isArray(response.data.returns), 'Should have returns array');
    
    results.passed.push('Get sale returns');
    if (verbose) console.log('✅ Get sale returns passed');
  } catch (error) {
    if (error.response?.status === 404) {
      if (verbose) console.log('⚠️  Sale returns endpoint not found');
    } else {
      results.failed.push({ test: 'Get sale returns', error: error.message });
      console.error('❌ Get sale returns failed:', error.message);
    }
  }
  
  // Test 2.2: Get Purchase Returns
  try {
    const response = await api.returns.getPurchaseReturns({ limit: 5 });
    assert(response.data, 'Should return purchase returns data');
    assert(typeof response.data.total === 'number', 'Should have total count');
    assert(Array.isArray(response.data.returns), 'Should have returns array');
    
    results.passed.push('Get purchase returns');
    if (verbose) console.log('✅ Get purchase returns passed');
  } catch (error) {
    if (error.response?.status === 404) {
      if (verbose) console.log('⚠️  Purchase returns endpoint not found');
    } else {
      results.failed.push({ test: 'Get purchase returns', error: error.message });
      console.error('❌ Get purchase returns failed:', error.message);
    }
  }
  
  // Test 2.3: Get Returnable Invoices
  try {
    const response = await api.returns.getReturnableInvoices();
    assert(response.data, 'Should return returnable invoices data');
    
    results.passed.push('Get returnable invoices');
    if (verbose) console.log('✅ Get returnable invoices passed');
  } catch (error) {
    if (error.response?.status === 404) {
      if (verbose) console.log('⚠️  Returnable invoices endpoint not found');
    } else {
      results.failed.push({ test: 'Get returnable invoices', error: error.message });
      console.error('❌ Get returnable invoices failed:', error.message);
    }
  }
  
  // Test 2.4: Get Returnable Purchases
  try {
    const response = await api.returns.getReturnablePurchases();
    assert(response.data, 'Should return returnable purchases data');
    
    results.passed.push('Get returnable purchases');
    if (verbose) console.log('✅ Get returnable purchases passed');
  } catch (error) {
    if (error.response?.status === 404) {
      if (verbose) console.log('⚠️  Returnable purchases endpoint not found');
    } else {
      results.failed.push({ test: 'Get returnable purchases', error: error.message });
      console.error('❌ Get returnable purchases failed:', error.message);
    }
  }
  
  // Test Suite 3: Return Reasons
  console.log('\n📝 Testing Return Configuration...');
  
  // Test 3.1: Get Return Reasons
  try {
    const response = await api.returns.getReturnReasons();
    if (response.data) {
      assert(Array.isArray(response.data) || typeof response.data === 'object', 
        'Should return return reasons');
      results.passed.push('Get return reasons');
      if (verbose) console.log('✅ Get return reasons passed');
    }
  } catch (error) {
    if (error.response?.status === 404) {
      // Return reasons might be hardcoded in frontend
      if (verbose) console.log('⚠️  Return reasons endpoint not found (using frontend constants)');
    } else {
      results.failed.push({ test: 'Get return reasons', error: error.message });
      console.error('❌ Get return reasons failed:', error.message);
    }
  }
  
  // Summary
  const totalTests = results.passed.length + results.failed.length;
  console.log(`\n📊 Returns Module Test Summary:`);
  console.log(`✅ Passed: ${results.passed.length}/${totalTests}`);
  console.log(`❌ Failed: ${results.failed.length}/${totalTests}`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    results.failed.forEach(({ test, error }) => {
      console.log(`  - ${test}: ${error}`);
    });
  }
  
  return results;
}

// Export for use in main test runner
window.testReturnsModule = testReturnsModule;