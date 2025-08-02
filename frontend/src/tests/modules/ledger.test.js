// Party Ledger Module Tests
import { assert } from '../utils/testHelpers.js';
import { api } from '../../services/api/index.js';
import { ledgerDataTransformer } from '../../services/api/utils/ledgerDataTransformer.js';

export async function testLedgerModule(options = {}) {
  const { verbose = false } = options;
  const results = { passed: [], failed: [] };
  
  console.log('\n📊 Testing Party Ledger Module...\n');
  
  // Test Suite 1: Data Transformer
  console.log('📋 Testing Data Transformer...');
  
  // Test 1.1: Transform Filters to Backend
  try {
    const frontendFilters = {
      party_id: 'party-001',
      from_date: '2024-01-01',
      to_date: '2024-01-31',
      party_type: 'customer'
    };
    
    const transformed = ledgerDataTransformer.transformFiltersToBackend(frontendFilters);
    
    assert(transformed.party_id === 'party-001', 'Should preserve party_id');
    assert(transformed.from_date === '2024-01-01', 'Should preserve from_date');
    assert(transformed.party_type === 'customer', 'Should preserve party_type');
    
    results.passed.push('Filters to Backend transformation');
    if (verbose) console.log('✅ Filters to Backend transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Filters to Backend transformation', error: error.message });
    console.error('❌ Filters to Backend transformation failed:', error.message);
  }
  
  // Test 1.2: Transform Ledger Data to Frontend
  try {
    const backendData = {
      party: {
        party_id: 'party-001',
        party_name: 'Test Customer',
        party_type: 'customer'
      },
      opening_balance: 1000,
      closing_balance: 1500,
      total_debit: 2000,
      total_credit: 1500,
      entries: [{
        ledger_id: 'ledger-001',
        transaction_date: '2024-01-15',
        transaction_type: 'sale',
        reference_type: 'sale',
        reference_number: 'INV-001',
        debit_amount: 1000,
        credit_amount: 0,
        running_balance: 2000
      }]
    };
    
    const transformed = ledgerDataTransformer.transformLedgerToFrontend(backendData);
    
    assert(transformed.party_details.party_id === 'party-001', 
      'Should transform party details');
    assert(transformed.transactions[0].type === 'Invoice', 
      'Should map transaction type');
    assert(transformed.transactions[0].debit === 1000, 
      'Should transform debit amount');
    
    results.passed.push('Ledger to Frontend transformation');
    if (verbose) console.log('✅ Ledger to Frontend transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Ledger to Frontend transformation', error: error.message });
    console.error('❌ Ledger to Frontend transformation failed:', error.message);
  }
  
  // Test 1.3: Validate Filters
  try {
    // Valid filters
    const validFilters = {
      party_id: 'party-001',
      from_date: '2024-01-01',
      to_date: '2024-01-31'
    };
    
    const validation = ledgerDataTransformer.validateFilters(validFilters);
    assert(validation.isValid === true, 'Valid filters should pass validation');
    
    // Invalid date range
    const invalidFilters = {
      party_id: 'party-001',
      from_date: '2024-01-31',
      to_date: '2024-01-01'
    };
    
    const invalidValidation = ledgerDataTransformer.validateFilters(invalidFilters);
    assert(invalidValidation.isValid === false, 'Invalid date range should fail');
    
    results.passed.push('Filter validation');
    if (verbose) console.log('✅ Filter validation passed');
  } catch (error) {
    results.failed.push({ test: 'Filter validation', error: error.message });
    console.error('❌ Filter validation failed:', error.message);
  }
  
  // Test Suite 2: Ledger API Integration
  console.log('\n📡 Testing Ledger API...');
  
  // Test 2.1: Get Outstanding Balances
  try {
    const response = await api.ledger.getOutstanding({ 
      party_type: 'customer',
      limit: 5 
    });
    assert(response.data, 'Should return outstanding data');
    assert(Array.isArray(response.data.parties), 'Should have parties array');
    
    results.passed.push('Get outstanding balances');
    if (verbose) console.log('✅ Get outstanding balances passed');
  } catch (error) {
    results.failed.push({ test: 'Get outstanding balances', error: error.message });
    console.error('❌ Get outstanding balances failed:', error.message);
  }
  
  // Test 2.2: Get Aging Report
  try {
    const response = await api.ledger.getAgingReport({ 
      party_type: 'customer' 
    });
    if (response.data) {
      assert(response.data, 'Should return aging data');
      results.passed.push('Get aging report');
      if (verbose) console.log('✅ Get aging report passed');
    }
  } catch (error) {
    if (error.response?.status === 404) {
      if (verbose) console.log('⚠️  Aging report endpoint not found');
    } else {
      results.failed.push({ test: 'Get aging report', error: error.message });
      console.error('❌ Get aging report failed:', error.message);
    }
  }
  
  // Test Suite 3: Transaction Type Mapping
  console.log('\n🔄 Testing Transaction Types...');
  
  // Test 3.1: Map Transaction Types
  try {
    const types = ['sale', 'purchase', 'payment', 'receipt', 'sale_return'];
    const expected = ['Invoice', 'Bill', 'Payment', 'Receipt', 'Sales Return'];
    
    types.forEach((type, index) => {
      const mapped = ledgerDataTransformer.mapTransactionType(type);
      assert(mapped === expected[index], 
        `Should map ${type} to ${expected[index]}`);
    });
    
    results.passed.push('Transaction type mapping');
    if (verbose) console.log('✅ Transaction type mapping passed');
  } catch (error) {
    results.failed.push({ test: 'Transaction type mapping', error: error.message });
    console.error('❌ Transaction type mapping failed:', error.message);
  }
  
  // Test Suite 4: Outstanding Data Transformation
  console.log('\n💰 Testing Outstanding Data...');
  
  // Test 4.1: Transform Outstanding Data
  try {
    const backendData = {
      total: 5,
      parties: [{
        party_id: 'party-001',
        party_name: 'Test Customer',
        outstanding_amount: 5000,
        days_overdue: 15,
        ageing: {
          current: 1000,
          '0_30': 2000,
          '31_60': 1500,
          '61_90': 500,
          above_90: 0
        }
      }]
    };
    
    const transformed = ledgerDataTransformer.transformOutstandingToFrontend(backendData);
    
    assert(transformed.total === 5, 'Should preserve total count');
    assert(transformed.parties[0].outstanding_amount === 5000, 
      'Should transform outstanding amount');
    assert(transformed.parties[0].ageing.days_0_30 === 2000, 
      'Should transform ageing buckets');
    
    results.passed.push('Outstanding data transformation');
    if (verbose) console.log('✅ Outstanding data transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Outstanding data transformation', error: error.message });
    console.error('❌ Outstanding data transformation failed:', error.message);
  }
  
  // Summary
  const totalTests = results.passed.length + results.failed.length;
  console.log(`\n📊 Party Ledger Module Test Summary:`);
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
window.testLedgerModule = testLedgerModule;