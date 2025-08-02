/**
 * API Endpoint Testing Script
 * Tests all critical API endpoints used by the frontend
 */

const axios = require('axios');

const API_BASE_URL = 'https://pharma-backend-production-0c09.up.railway.app/api/v1';

// Test results storage
const results = {
  passed: 0,
  failed: 0,
  errors: []
};

// Color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

async function testEndpoint(name, method, endpoint, data = null) {
  try {
    console.log(`\n🧪 Testing ${name}...`);
    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    console.log(`${colors.green}✓ ${name} - Status: ${response.status}${colors.reset}`);
    console.log(`  Response: ${JSON.stringify(response.data).substring(0, 100)}...`);
    results.passed++;
    return response.data;
  } catch (error) {
    console.log(`${colors.red}✗ ${name} - Failed${colors.reset}`);
    console.log(`  Error: ${error.response?.status || error.code} - ${error.response?.data?.detail || error.message}`);
    results.failed++;
    results.errors.push({
      endpoint: name,
      error: error.response?.data || error.message
    });
    return null;
  }
}

async function runTests() {
  console.log('🚀 Starting API Endpoint Tests\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  // 1. Customer Endpoints
  console.log(`${colors.yellow}=== Customer Endpoints ===${colors.reset}`);
  await testEndpoint('List Customers', 'GET', '/customers/');
  await testEndpoint('Search Customers', 'GET', '/customers/?search=test');
  await testEndpoint('Create Customer', 'POST', '/customers/', {
    name: "Test Customer",
    phone: "9999999999",
    email: "test@example.com",
    address: "Test Address",
    city: "Test City",
    state: "Test State",
    pincode: "123456",
    gst_number: "29ABCDE1234F1Z5",
    customer_type: "retail"
  });

  // 2. Product Endpoints
  console.log(`\n${colors.yellow}=== Product Endpoints ===${colors.reset}`);
  await testEndpoint('List Products', 'GET', '/products/');
  await testEndpoint('Search Products', 'GET', '/products/search?q=test');
  
  // 3. Invoice Endpoints
  console.log(`\n${colors.yellow}=== Invoice Endpoints ===${colors.reset}`);
  await testEndpoint('List Invoices', 'GET', '/invoices/');
  
  // 4. Order Endpoints
  console.log(`\n${colors.yellow}=== Order Endpoints ===${colors.reset}`);
  await testEndpoint('List Orders', 'GET', '/orders/');
  
  // 5. Payment Endpoints
  console.log(`\n${colors.yellow}=== Payment Endpoints ===${colors.reset}`);
  await testEndpoint('List Payments', 'GET', '/payments/');
  
  // 6. Ledger Endpoints
  console.log(`\n${colors.yellow}=== Ledger Endpoints ===${colors.reset}`);
  await testEndpoint('Party Balances', 'GET', '/ledger/party-balances');
  await testEndpoint('Outstanding Bills', 'GET', '/ledger/outstanding');
  
  // 7. Stock Endpoints
  console.log(`\n${colors.yellow}=== Stock Endpoints ===${colors.reset}`);
  await testEndpoint('Current Stock', 'GET', '/stock/current');
  
  // 8. Dashboard Endpoints
  console.log(`\n${colors.yellow}=== Dashboard Endpoints ===${colors.reset}`);
  await testEndpoint('Dashboard Stats', 'GET', '/dashboard/stats');

  // Print Summary
  console.log(`\n${colors.yellow}=== Test Summary ===${colors.reset}`);
  console.log(`${colors.green}Passed: ${results.passed}${colors.reset}`);
  console.log(`${colors.red}Failed: ${results.failed}${colors.reset}`);
  
  if (results.errors.length > 0) {
    console.log(`\n${colors.red}Failed Endpoints:${colors.reset}`);
    results.errors.forEach(err => {
      console.log(`- ${err.endpoint}`);
      console.log(`  ${JSON.stringify(err.error, null, 2)}`);
    });
  }

  // Backend Status Check
  if (results.failed > results.passed) {
    console.log(`\n${colors.red}⚠️  BACKEND ISSUE DETECTED${colors.reset}`);
    console.log('The backend appears to have deployment issues.');
    console.log('Error: "No module named \'app.database\'" suggests missing dependencies or incorrect deployment.');
    console.log('\nRecommended Actions:');
    console.log('1. Check Railway deployment logs');
    console.log('2. Verify all Python dependencies are in requirements.txt');
    console.log('3. Check database connection settings');
    console.log('4. Ensure DATABASE_URL environment variable is set');
  }
}

// Run the tests
runTests().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});