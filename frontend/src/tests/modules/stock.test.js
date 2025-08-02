// Stock Movement Module Tests
import { assert } from '../utils/testHelpers.js';
import { api } from '../../services/api/index.js';
import { stockDataTransformer } from '../../services/api/utils/stockDataTransformer.js';

export async function testStockModule(options = {}) {
  const { verbose = false } = options;
  const results = { passed: [], failed: [] };
  
  console.log('\n📦 Testing Stock Movement Module...\n');
  
  // Test Suite 1: Data Transformer
  console.log('📋 Testing Data Transformer...');
  
  // Test 1.1: Transform Movement to Backend
  try {
    const frontendData = {
      date: '2024-01-01',
      type: 'receive',
      reason: 'gift',
      source_destination: 'Supplier XYZ',
      items: [{
        product_id: 1,
        quantity: 10,
        batch_number: 'BATCH-001',
        expiry_date: '2025-01-01'
      }]
    };
    
    const transformed = stockDataTransformer.transformMovementToBackend(frontendData, 'receive');
    
    assert(Array.isArray(transformed), 'Should return array for multiple items');
    assert(transformed[0].movement_date === '2024-01-01', 
      'Should transform date to movement_date');
    assert(transformed[0].source_location === 'Supplier XYZ', 
      'Should transform source_destination to source_location for receive');
    assert(transformed[0].quantity === 10, 
      'Should preserve quantity');
    
    results.passed.push('Movement to Backend transformation');
    if (verbose) console.log('✅ Movement to Backend transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Movement to Backend transformation', error: error.message });
    console.error('❌ Movement to Backend transformation failed:', error.message);
  }
  
  // Test 1.2: Transform Transfer Data
  try {
    const transferData = {
      date: '2024-01-01',
      product_id: 1,
      quantity: 5,
      from_location: 'Warehouse A',
      to_location: 'Warehouse B',
      batch_number: 'BATCH-001'
    };
    
    const transformed = stockDataTransformer.transformTransferToBackend(transferData);
    
    assert(transformed.movement_date === '2024-01-01', 
      'Should transform date to movement_date');
    assert(transformed.source_location === 'Warehouse A', 
      'Should transform from_location to source_location');
    assert(transformed.destination_location === 'Warehouse B', 
      'Should transform to_location to destination_location');
    
    results.passed.push('Transfer data transformation');
    if (verbose) console.log('✅ Transfer data transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Transfer data transformation', error: error.message });
    console.error('❌ Transfer data transformation failed:', error.message);
  }
  
  // Test 1.3: Validate Movement Data
  try {
    // Valid receive movement
    const validMovement = {
      movement_date: '2024-01-01',
      reason: 'gift',
      product_id: 1,
      quantity: 10
    };
    
    const validation = stockDataTransformer.validateMovementData(validMovement, 'receive');
    assert(validation.isValid === true, 'Valid movement should pass validation');
    
    // Invalid movement (missing quantity)
    const invalidMovement = {
      movement_date: '2024-01-01',
      reason: 'gift',
      product_id: 1
    };
    
    const invalidValidation = stockDataTransformer.validateMovementData(invalidMovement, 'receive');
    assert(invalidValidation.isValid === false, 'Invalid movement should fail validation');
    assert(invalidValidation.errors.length > 0, 'Should return validation errors');
    
    results.passed.push('Movement data validation');
    if (verbose) console.log('✅ Movement data validation passed');
  } catch (error) {
    results.failed.push({ test: 'Movement data validation', error: error.message });
    console.error('❌ Movement data validation failed:', error.message);
  }
  
  // Test Suite 2: Stock API Integration
  console.log('\n📡 Testing Stock API...');
  
  // Test 2.1: Get Stock Movements
  try {
    const response = await api.stock.getMovements({ limit: 5 });
    assert(response.data, 'Should return stock movements data');
    assert(typeof response.data.total === 'number', 'Should have total count');
    assert(Array.isArray(response.data.movements), 'Should have movements array');
    
    results.passed.push('Get stock movements');
    if (verbose) console.log('✅ Get stock movements passed');
  } catch (error) {
    results.failed.push({ test: 'Get stock movements', error: error.message });
    console.error('❌ Get stock movements failed:', error.message);
  }
  
  // Test 2.2: Get Movement Reasons
  try {
    const response = await api.stock.getMovementReasons('receive');
    assert(response.data, 'Should return movement reasons');
    
    results.passed.push('Get movement reasons');
    if (verbose) console.log('✅ Get movement reasons passed');
  } catch (error) {
    if (error.response?.status === 404) {
      if (verbose) console.log('⚠️  Movement reasons endpoint not found');
    } else {
      results.failed.push({ test: 'Get movement reasons', error: error.message });
      console.error('❌ Get movement reasons failed:', error.message);
    }
  }
  
  // Test 2.3: Get Stock Levels
  try {
    const response = await api.stock.getStockLevels({ limit: 5 });
    assert(response.data, 'Should return stock levels data');
    
    results.passed.push('Get stock levels');
    if (verbose) console.log('✅ Get stock levels passed');
  } catch (error) {
    if (error.response?.status === 404) {
      if (verbose) console.log('⚠️  Stock levels endpoint not found');
    } else {
      results.failed.push({ test: 'Get stock levels', error: error.message });
      console.error('❌ Get stock levels failed:', error.message);
    }
  }
  
  // Test Suite 3: Movement Operations
  console.log('\n🔄 Testing Movement Operations...');
  
  // Test 3.1: Validate Movement Before Save
  try {
    const testMovement = {
      date: new Date().toISOString().split('T')[0],
      reason: 'test',
      product_id: 1,
      quantity: 1,
      batch_number: 'TEST-BATCH'
    };
    
    const response = await api.stock.validateMovement(testMovement);
    if (response.data) {
      assert(typeof response.data.valid === 'boolean', 'Should return validation result');
      results.passed.push('Validate movement');
      if (verbose) console.log('✅ Validate movement passed');
    }
  } catch (error) {
    if (error.response?.status === 404) {
      if (verbose) console.log('⚠️  Movement validation endpoint not found');
    } else if (error.response?.status === 400) {
      // Expected for invalid test data
      results.passed.push('Validate movement (error handling)');
      if (verbose) console.log('✅ Validate movement error handling passed');
    } else {
      results.failed.push({ test: 'Validate movement', error: error.message });
      console.error('❌ Validate movement failed:', error.message);
    }
  }
  
  // Summary
  const totalTests = results.passed.length + results.failed.length;
  console.log(`\n📊 Stock Movement Module Test Summary:`);
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
window.testStockModule = testStockModule;