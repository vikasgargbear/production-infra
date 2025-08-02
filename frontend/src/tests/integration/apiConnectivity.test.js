/**
 * API Connectivity Test
 * Tests basic connectivity to all API endpoints
 */

import { api } from '../../services/api';
import { TEST_CONFIG } from '../testConfig';
import { createTestContext } from '../utils/testHelpers';

const API_MODULES = [
  { name: 'auth', endpoint: 'getCurrentUser', requiresAuth: true },
  { name: 'customers', endpoint: 'getAll', params: { limit: 1 } },
  { name: 'products', endpoint: 'getAll', params: { limit: 1 } },
  { name: 'suppliers', endpoint: 'getAll', params: { limit: 1 } },
  { name: 'sales', endpoint: 'getAll', params: { limit: 1 } },
  { name: 'purchases', endpoint: 'getAll', params: { limit: 1 } },
  { name: 'invoices', endpoint: 'getAll', params: { limit: 1 } },
  { name: 'challans', endpoint: 'getAll', params: { limit: 1 } },
  { name: 'orders', endpoint: 'getAll', params: { limit: 1 } },
  { name: 'payments', endpoint: 'getAll', params: { limit: 1 } },
  { name: 'returns', endpoint: 'getAll', params: { limit: 1 } },
  { name: 'ledger', endpoint: 'getOutstanding', params: {} },
  { name: 'stock', endpoint: 'getMovements', params: { limit: 1 } },
  { name: 'reports', endpoint: 'getDashboard', params: {} }
];

export const testAPIConnectivity = async () => {
  console.log('🔌 Starting API Connectivity Test...\n');
  console.log(`API Base URL: ${TEST_CONFIG.API_BASE_URL}\n`);
  
  const context = createTestContext();
  const results = {
    passed: [],
    failed: []
  };

  // Test health endpoint first
  try {
    context.log('Testing API health endpoint...');
    const healthResponse = await fetch(`${TEST_CONFIG.API_BASE_URL}/health`);
    
    if (healthResponse.ok) {
      console.log('✅ API server is healthy');
      results.passed.push('Health check');
    } else {
      throw new Error(`Health check failed with status ${healthResponse.status}`);
    }
  } catch (error) {
    console.error('❌ API server health check failed:', error.message);
    results.failed.push({ test: 'Health check', error: error.message });
    
    // If health check fails, skip other tests
    console.log('\n⚠️  Skipping other tests due to health check failure');
    return results;
  }

  // Test each API module
  for (const module of API_MODULES) {
    try {
      context.log(`Testing ${module.name} API...`);
      
      // Skip auth endpoints if not configured
      if (module.requiresAuth && !localStorage.getItem('authToken')) {
        console.log(`⏭️  Skipping ${module.name} (requires authentication)`);
        continue;
      }
      
      // Check if module exists
      if (!api[module.name]) {
        throw new Error(`Module '${module.name}' not found in API`);
      }
      
      // Check if endpoint exists
      if (!api[module.name][module.endpoint]) {
        throw new Error(`Endpoint '${module.endpoint}' not found in ${module.name} module`);
      }
      
      // Make API call
      const response = await api[module.name][module.endpoint](module.params);
      
      // Check response
      if (response && (response.data !== undefined || response.status === 200)) {
        console.log(`✅ ${module.name} API is accessible`);
        results.passed.push(`${module.name} API`);
      } else {
        throw new Error('Invalid response format');
      }
      
    } catch (error) {
      console.error(`❌ ${module.name} API failed:`, error.message);
      results.failed.push({ 
        test: `${module.name} API`, 
        error: error.message,
        endpoint: `${module.name}.${module.endpoint}`
      });
    }
  }

  // Test critical endpoints with actual data
  console.log('\n🔍 Testing Critical Endpoints...');
  
  // Test invoice number generation
  try {
    context.log('Testing invoice number generation...');
    const invoiceNumResponse = await api.invoices.generateNumber();
    
    if (invoiceNumResponse.data && invoiceNumResponse.data.invoice_number) {
      console.log(`✅ Invoice number generation works: ${invoiceNumResponse.data.invoice_number}`);
      results.passed.push('Invoice number generation');
    } else {
      throw new Error('Invalid invoice number response');
    }
  } catch (error) {
    console.error('❌ Invoice number generation failed:', error.message);
    results.failed.push({ test: 'Invoice number generation', error: error.message });
  }

  // Test GST calculation endpoint
  try {
    context.log('Testing GST calculation...');
    
    const testData = {
      items: [{
        product_id: 1,
        quantity: 10,
        unit_price: 100,
        tax_percent: 18
      }]
    };
    
    const calcResponse = await api.invoices.calculate(testData);
    
    if (calcResponse.data) {
      console.log('✅ GST calculation endpoint works');
      results.passed.push('GST calculation');
    } else {
      throw new Error('Invalid calculation response');
    }
  } catch (error) {
    console.error('❌ GST calculation failed:', error.message);
    results.failed.push({ test: 'GST calculation', error: error.message });
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 API Connectivity Test Summary:');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⏱️ Duration: ${context.getDuration()}ms`);
  
  if (results.failed.length > 0) {
    console.log('\nFailed Endpoints:');
    results.failed.forEach(({ test, error, endpoint }) => {
      console.log(`  - ${test}: ${error}`);
      if (endpoint) console.log(`    Endpoint: ${endpoint}`);
    });
  }
  
  // Overall status
  const totalTests = results.passed.length + results.failed.length;
  const passRate = totalTests > 0 ? (results.passed.length / totalTests * 100).toFixed(1) : 0;
  console.log(`\nOverall Pass Rate: ${passRate}%`);
  
  return results;
};

// Export for browser
if (typeof window !== 'undefined') {
  window.testAPIConnectivity = testAPIConnectivity;
}