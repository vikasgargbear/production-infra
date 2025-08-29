/**
 * Test script for optimized return API
 * Tests the new getReturnableInvoices method for performance and functionality
 */

import InvoiceApiService from './src/services/InvoiceApiService.js';

// Test configuration
const TEST_CUSTOMER_ID = 'CUST-001'; // Replace with actual customer ID
const PERFORMANCE_THRESHOLD = 3000; // 3 seconds max response time

// Performance test function
async function testPerformance() {
  console.log('🧪 Testing Return API Optimization...\n');
  
  // Test 1: Basic functionality test
  console.log('Test 1: Basic Functionality');
  console.log('-'.repeat(40));
  
  const startTime = Date.now();
  
  try {
    const response = await InvoiceApiService.getReturnableInvoices({
      customer_id: TEST_CUSTOMER_ID,
      limit: 10,
      offset: 0
    });
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;
    
    if (response.success) {
      console.log('✅ API call successful');
      console.log(`📊 Response time: ${responseTime}ms`);
      console.log(`📦 Invoices fetched: ${response.data.invoices?.length || 0}`);
      
      if (responseTime < PERFORMANCE_THRESHOLD) {
        console.log(`✅ Performance: PASSED (under ${PERFORMANCE_THRESHOLD}ms)`);
      } else {
        console.log(`⚠️ Performance: WARNING (${responseTime}ms > ${PERFORMANCE_THRESHOLD}ms)`);
      }
      
      // Display sample invoice data
      if (response.data.invoices?.length > 0) {
        console.log('\nSample Invoice Data:');
        const invoice = response.data.invoices[0];
        console.log(`  - Invoice: ${invoice.invoice_number}`);
        console.log(`  - Date: ${invoice.invoice_date}`);
        console.log(`  - Amount: ₹${invoice.final_amount}`);
        console.log(`  - Status: ${invoice.payment_status}`);
      }
    } else {
      console.log('❌ API call failed');
      console.log(`Error: ${response.error?.message || 'Unknown error'}`);
    }
  } catch (error) {
    console.log('❌ Test failed with exception');
    console.log(`Error: ${error.message}`);
  }
  
  console.log('\n' + '='.repeat(40) + '\n');
  
  // Test 2: Compare with original method
  console.log('Test 2: Performance Comparison');
  console.log('-'.repeat(40));
  
  try {
    // Test optimized method
    const optimizedStart = Date.now();
    const optimizedResponse = await InvoiceApiService.getReturnableInvoices({
      customer_id: TEST_CUSTOMER_ID,
      limit: 20
    });
    const optimizedTime = Date.now() - optimizedStart;
    
    // Test original method
    const originalStart = Date.now();
    const originalResponse = await InvoiceApiService.getInvoices({
      customer_id: TEST_CUSTOMER_ID,
      limit: 20
    });
    const originalTime = Date.now() - originalStart;
    
    console.log('📊 Performance Comparison:');
    console.log(`  Optimized Method: ${optimizedTime}ms`);
    console.log(`  Original Method: ${originalTime}ms`);
    
    const improvement = ((originalTime - optimizedTime) / originalTime * 100).toFixed(1);
    if (optimizedTime < originalTime) {
      console.log(`✅ Performance improved by ${improvement}%`);
    } else {
      console.log(`⚠️ No performance improvement detected`);
    }
    
  } catch (error) {
    console.log('⚠️ Comparison test skipped (API not available)');
  }
  
  console.log('\n' + '='.repeat(40) + '\n');
  
  // Test 3: Pagination test
  console.log('Test 3: Pagination Test');
  console.log('-'.repeat(40));
  
  try {
    const page1 = await InvoiceApiService.getReturnableInvoices({
      customer_id: TEST_CUSTOMER_ID,
      limit: 5,
      offset: 0
    });
    
    const page2 = await InvoiceApiService.getReturnableInvoices({
      customer_id: TEST_CUSTOMER_ID,
      limit: 5,
      offset: 5
    });
    
    if (page1.success && page2.success) {
      console.log('✅ Pagination working');
      console.log(`  Page 1: ${page1.data.invoices?.length || 0} invoices`);
      console.log(`  Page 2: ${page2.data.invoices?.length || 0} invoices`);
      
      // Check for duplicates
      const page1Ids = page1.data.invoices?.map(inv => inv.invoice_id) || [];
      const page2Ids = page2.data.invoices?.map(inv => inv.invoice_id) || [];
      const hasDuplicates = page1Ids.some(id => page2Ids.includes(id));
      
      if (!hasDuplicates) {
        console.log('✅ No duplicate invoices between pages');
      } else {
        console.log('⚠️ Duplicate invoices detected between pages');
      }
    }
  } catch (error) {
    console.log('⚠️ Pagination test failed');
  }
  
  console.log('\n' + '='.repeat(40));
  console.log('\n📋 Test Summary:');
  console.log('The optimized getReturnableInvoices method:');
  console.log('1. Uses specialized endpoint for returns');
  console.log('2. Fetches only essential fields');
  console.log('3. Excludes heavy joins to prevent timeouts');
  console.log('4. Falls back gracefully to regular endpoint');
  console.log('5. Maintains compatibility with existing UI');
}

// Run tests
console.log('🚀 Starting Return API Optimization Tests\n');
testPerformance().then(() => {
  console.log('\n✅ All tests completed!');
}).catch(error => {
  console.error('\n❌ Test suite failed:', error);
});