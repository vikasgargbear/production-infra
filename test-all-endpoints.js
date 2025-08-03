#!/usr/bin/env node

/**
 * API Endpoint Test Script
 * Tests all critical endpoints to ensure they work with the database
 */

const axios = require('axios');

const API_BASE = 'https://pharma-backend-production-0c09.up.railway.app/api';
const TEST_ORG_ID = 'ad808530-1ddb-4377-ab20-67bef145d80d';

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

async function testEndpoint(method, path, data = null, description = '') {
  const url = `${API_BASE}${path}`;
  console.log(`\n${colors.blue}Testing: ${method} ${path}${colors.reset}`);
  if (description) console.log(`  ${description}`);
  
  try {
    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    console.log(`  ${colors.green}✓ Success (${response.status})${colors.reset}`);
    return { success: true, data: response.data };
  } catch (error) {
    const status = error.response?.status || 'Network Error';
    const message = error.response?.data?.detail || error.message;
    console.log(`  ${colors.red}✗ Failed (${status}): ${message}${colors.reset}`);
    return { success: false, error: message };
  }
}

async function runTests() {
  console.log(`${colors.yellow}=== API Endpoint Test Suite ===${colors.reset}`);
  console.log(`Testing against: ${API_BASE}`);
  console.log(`Organization ID: ${TEST_ORG_ID}\n`);
  
  const results = {
    passed: 0,
    failed: 0,
    endpoints: []
  };
  
  // Test groups
  const tests = [
    // Products
    { method: 'GET', path: '/products/search?q=&limit=10', description: 'Search products (empty query)' },
    { method: 'GET', path: '/products/search?q=test&limit=10', description: 'Search products with query' },
    { 
      method: 'POST', 
      path: '/products/', 
      data: {
        product_name: `Test Product ${Date.now()}`,
        brand: 'Test Brand',
        manufacturer: 'Test Manufacturer',
        composition: { active: 'Test Compound' },
        hsn_code: '3004',
        gst_percentage: 12
      },
      description: 'Create new product' 
    },
    
    // Customers
    { method: 'GET', path: '/customers/search?q=test', description: 'Search customers' },
    { method: 'GET', path: '/customers/', description: 'List customers' },
    
    // Suppliers
    { method: 'GET', path: '/suppliers/search?q=test', description: 'Search suppliers' },
    { method: 'GET', path: '/suppliers/', description: 'List suppliers' },
    
    // Sales Orders
    { method: 'GET', path: '/sales-orders/', description: 'List sales orders' },
    { method: 'GET', path: '/enterprise-orders/', description: 'List enterprise orders' },
    
    // Invoices
    { method: 'GET', path: '/invoices/', description: 'List invoices' },
    { method: 'GET', path: '/invoices/list', description: 'Alternative invoice list' },
    
    // Delivery Challans
    { method: 'GET', path: '/enterprise-delivery-challan/', description: 'List delivery challans' },
    
    // Purchases
    { method: 'GET', path: '/purchases/', description: 'List purchases' },
    { method: 'GET', path: '/purchases-enhanced/pending-receipts', description: 'Pending purchase receipts' },
    
    // Stock/Inventory
    { method: 'GET', path: '/inventory/', description: 'Inventory status' },
    { method: 'GET', path: '/stock-movements/', description: 'Stock movements' },
    
    // Dashboard
    { method: 'GET', path: '/dashboard/stats', description: 'Dashboard statistics' },
    
    // Collection Center
    { method: 'GET', path: '/collection-center/dashboard', description: 'Collection center dashboard' },
    
    // Returns
    { method: 'GET', path: '/sale-returns/', description: 'Sales returns' },
    { method: 'GET', path: '/purchase-returns/', description: 'Purchase returns' },
    
    // Payments
    { method: 'GET', path: '/payments/', description: 'List payments' },
    
    // Party Ledger
    { method: 'GET', path: '/party-ledger/summary', description: 'Party ledger summary' },
  ];
  
  // Run tests
  for (const test of tests) {
    const result = await testEndpoint(test.method, test.path, test.data, test.description);
    
    results.endpoints.push({
      ...test,
      success: result.success,
      error: result.error
    });
    
    if (result.success) {
      results.passed++;
    } else {
      results.failed++;
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Summary
  console.log(`\n${colors.yellow}=== Test Summary ===${colors.reset}`);
  console.log(`Total Tests: ${results.passed + results.failed}`);
  console.log(`${colors.green}Passed: ${results.passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${results.failed}${colors.reset}`);
  
  if (results.failed > 0) {
    console.log(`\n${colors.red}Failed Endpoints:${colors.reset}`);
    results.endpoints
      .filter(e => !e.success)
      .forEach(e => {
        console.log(`  - ${e.method} ${e.path}: ${e.error}`);
      });
  }
  
  // Save results
  const fs = require('fs');
  fs.writeFileSync('test-results.json', JSON.stringify(results, null, 2));
  console.log(`\nDetailed results saved to test-results.json`);
}

// Run tests
runTests().catch(error => {
  console.error(`${colors.red}Test suite failed:${colors.reset}`, error);
  process.exit(1);
});