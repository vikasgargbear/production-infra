const axios = require('axios');

const BASE_URL = 'https://pharma-backend-production-0c09.up.railway.app/api';

// Categories of endpoints to test
const ENDPOINT_GROUPS = {
  // Core Product Management
  products: [
    { method: 'GET', path: '/products/search?q=&limit=10', description: 'Product search (empty)' },
    { method: 'GET', path: '/products/search?q=test&limit=10', description: 'Product search with query' },
    { method: 'GET', path: '/products/', description: 'List all products' },
    { method: 'GET', path: '/products/1', description: 'Get single product' },
  ],
  
  // Customer Management
  customers: [
    { method: 'GET', path: '/customers/', description: 'List customers' },
    { method: 'GET', path: '/customers/search?q=test', description: 'Search customers' },
    { method: 'GET', path: '/customers/1', description: 'Get single customer' },
  ],
  
  // Supplier Management
  suppliers: [
    { method: 'GET', path: '/suppliers/', description: 'List suppliers' },
    { method: 'GET', path: '/suppliers/search?q=test', description: 'Search suppliers' },
    { method: 'GET', path: '/suppliers/1', description: 'Get single supplier' },
  ],
  
  // Sales Module
  sales: [
    { method: 'GET', path: '/sales-orders/', description: 'List sales orders' },
    { method: 'GET', path: '/sales-orders/1', description: 'Get single sales order' },
    { method: 'GET', path: '/enterprise-orders/', description: 'List enterprise orders' },
    { method: 'GET', path: '/invoices/', description: 'List invoices' },
    { method: 'GET', path: '/invoices/1', description: 'Get single invoice' },
    { method: 'GET', path: '/invoices/list', description: 'Alternative invoice list' },
    { method: 'GET', path: '/invoices/pending', description: 'Pending invoices' },
    { method: 'GET', path: '/invoices/overdue', description: 'Overdue invoices' },
  ],
  
  // Delivery Challan Module
  delivery: [
    { method: 'GET', path: '/enterprise-delivery-challan/', description: 'List delivery challans' },
    { method: 'GET', path: '/enterprise-delivery-challan/1', description: 'Get single challan' },
    { method: 'GET', path: '/enterprise-delivery-challan/analytics/summary', description: 'Challan analytics' },
  ],
  
  // Purchase Module
  purchases: [
    { method: 'GET', path: '/purchases/', description: 'List purchases/POs' },
    { method: 'GET', path: '/purchases/1', description: 'Get single purchase' },
    { method: 'GET', path: '/purchases/analytics/summary', description: 'Purchase analytics' },
    { method: 'GET', path: '/purchases-enhanced/pending-receipts', description: 'Pending receipts' },
    { method: 'GET', path: '/purchase-entry/', description: 'Purchase entries' },
    { method: 'GET', path: '/purchase-entry/from-po/1', description: 'Create entry from PO' },
  ],
  
  // Inventory Management
  inventory: [
    { method: 'GET', path: '/inventory/', description: 'Inventory status' },
    { method: 'GET', path: '/inventory/stock-summary', description: 'Stock summary' },
    { method: 'GET', path: '/inventory/batches', description: 'List batches' },
    { method: 'GET', path: '/stock-movements/', description: 'Stock movements' },
    { method: 'GET', path: '/stock-movements/reasons', description: 'Movement reasons' },
    { method: 'GET', path: '/stock-movements/near-expiry', description: 'Near expiry items' },
    { method: 'GET', path: '/stock-movements/low-stock', description: 'Low stock items' },
  ],
  
  // Returns Module
  returns: [
    { method: 'GET', path: '/sale-returns/', description: 'Sales returns' },
    { method: 'GET', path: '/sale-returns/returnable-invoices', description: 'Returnable invoices' },
    { method: 'GET', path: '/purchase-returns/', description: 'Purchase returns' },
    { method: 'GET', path: '/purchase-returns/returnable-purchases/', description: 'Returnable purchases' },
  ],
  
  // Financial Module
  financial: [
    { method: 'GET', path: '/payments/', description: 'List payments' },
    { method: 'GET', path: '/party-ledger/summary', description: 'Party ledger summary' },
    { method: 'GET', path: '/party-ledger/customer/1', description: 'Customer ledger' },
    { method: 'GET', path: '/party-ledger/supplier/1', description: 'Supplier ledger' },
    { method: 'GET', path: '/collection-center/dashboard', description: 'Collection dashboard' },
    { method: 'GET', path: '/collection-center/outstanding?party_type=customer', description: 'Customer outstanding' },
    { method: 'GET', path: '/collection-center/outstanding?party_type=supplier', description: 'Supplier outstanding' },
  ],
  
  // Dashboard & Analytics
  dashboard: [
    { method: 'GET', path: '/dashboard/stats', description: 'Dashboard statistics' },
    { method: 'GET', path: '/dashboard/sales-summary', description: 'Sales summary' },
    { method: 'GET', path: '/dashboard/inventory-summary', description: 'Inventory summary' },
    { method: 'GET', path: '/dashboard/recent-activities', description: 'Recent activities' },
  ],
  
  // History Endpoints (for all modules)
  history: [
    { method: 'GET', path: '/sales-orders/history', description: 'Sales order history' },
    { method: 'GET', path: '/invoices/history', description: 'Invoice history' },
    { method: 'GET', path: '/purchases/history', description: 'Purchase history' },
    { method: 'GET', path: '/delivery-challans/history', description: 'Challan history' },
  ]
};

// Test results storage
const results = {
  timestamp: new Date().toISOString(),
  summary: { total: 0, passed: 0, failed: 0 },
  groups: {}
};

// Test a single endpoint
async function testEndpoint(endpoint) {
  const url = `${BASE_URL}${endpoint.path}`;
  
  try {
    const response = await axios({
      method: endpoint.method,
      url: url,
      timeout: 5000,
      validateStatus: function (status) {
        return status < 500; // Accept any status < 500
      }
    });
    
    if (response.status === 200) {
      return { 
        success: true, 
        status: response.status,
        hasData: response.data ? true : false
      };
    } else if (response.status === 404) {
      return { 
        success: false, 
        status: response.status,
        error: 'Endpoint not found'
      };
    } else if (response.status === 405) {
      return { 
        success: false, 
        status: response.status,
        error: 'Method not allowed'
      };
    } else {
      return { 
        success: false, 
        status: response.status,
        error: response.data || 'Unknown error'
      };
    }
  } catch (error) {
    return { 
      success: false, 
      error: error.message,
      status: error.response?.status || 0
    };
  }
}

// Test all endpoints
async function runTests() {
  console.log('🔍 Testing all API endpoints...\n');
  console.log(`Backend URL: ${BASE_URL}\n`);
  console.log('═'.repeat(80));
  
  for (const [groupName, endpoints] of Object.entries(ENDPOINT_GROUPS)) {
    console.log(`\n📦 ${groupName.toUpperCase()}`);
    console.log('─'.repeat(40));
    
    results.groups[groupName] = {
      total: endpoints.length,
      passed: 0,
      failed: 0,
      endpoints: []
    };
    
    for (const endpoint of endpoints) {
      process.stdout.write(`  ${endpoint.description}... `);
      const result = await testEndpoint(endpoint);
      
      results.groups[groupName].endpoints.push({
        ...endpoint,
        result
      });
      
      results.summary.total++;
      
      if (result.success) {
        results.groups[groupName].passed++;
        results.summary.passed++;
        console.log(`✅ (${result.status})`);
      } else {
        results.groups[groupName].failed++;
        results.summary.failed++;
        console.log(`❌ (${result.status || 'ERR'}) - ${result.error}`);
      }
    }
    
    // Group summary
    const group = results.groups[groupName];
    console.log(`  Summary: ${group.passed}/${group.total} passed`);
  }
  
  // Overall summary
  console.log('\n' + '═'.repeat(80));
  console.log('📊 OVERALL RESULTS');
  console.log('─'.repeat(40));
  console.log(`✅ Passed: ${results.summary.passed}/${results.summary.total} (${Math.round(results.summary.passed/results.summary.total*100)}%)`);
  console.log(`❌ Failed: ${results.summary.failed}/${results.summary.total} (${Math.round(results.summary.failed/results.summary.total*100)}%)`);
  
  // Critical failures (5xx errors)
  console.log('\n🚨 CRITICAL FAILURES (500 errors):');
  for (const [groupName, group] of Object.entries(results.groups)) {
    const criticalFailures = group.endpoints.filter(e => 
      !e.result.success && e.result.status >= 500
    );
    if (criticalFailures.length > 0) {
      console.log(`\n  ${groupName}:`);
      criticalFailures.forEach(e => {
        console.log(`    - ${e.description}: ${e.result.error}`);
      });
    }
  }
  
  // Save detailed results
  require('fs').writeFileSync(
    'comprehensive-test-results.json',
    JSON.stringify(results, null, 2)
  );
  console.log('\n💾 Detailed results saved to comprehensive-test-results.json');
}

// Run the tests
runTests().catch(console.error);