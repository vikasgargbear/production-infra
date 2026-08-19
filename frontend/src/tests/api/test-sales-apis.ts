/**
 * Sales API Test Suite
 * Run with: npx ts-node src/tests/api/test-sales-apis.ts
 *
 * Tests the three sales history APIs:
 * 1. Invoices API: GET /api/invoices
 * 2. Challans API: GET /api/challan
 * 3. Sales Orders API: GET /api/sales-orders
 */

import { invoicesApi, challansApi, ordersApi } from '../../services/api';

// Expected response structures based on backend code:

/**
 * INVOICES API Response:
 * {
 *   invoices: [{
 *     invoice_id: number,
 *     invoice_number: string,
 *     invoice_date: string,
 *     customer_id: number,
 *     customer_name: string,
 *     final_amount: number,
 *     paid_amount: number,
 *     pending_amount: number,
 *     payment_status: string,
 *     due_date: string,
 *     items_count: number
 *   }],
 *   total: number
 * }
 */

/**
 * CHALLANS API Response (direct array, NOT wrapped):
 * [{
 *   challan_id: number,
 *   challan_number: string,
 *   challan_date: string,
 *   order_id: number | null,
 *   customer_id: number,
 *   customer_name: string,
 *   challan_status: string,
 *   dispatch_date: string,
 *   transporter_name: string,
 *   vehicle_number: string,
 *   lr_number: string,
 *   total_quantity: number,
 *   total_amount: number,
 *   taxable_amount: number,
 *   gst_amount: number,
 *   freight_charges: number,
 *   delivery_status: string,
 *   notes: string
 * }]
 */

/**
 * SALES ORDERS API Response:
 * {
 *   total: number,
 *   page: number,
 *   per_page: number,
 *   orders: [{
 *     order_id: number,
 *     order_number: string,
 *     order_date: string,
 *     order_status: string,
 *     customer_id: number,
 *     customer_name: string,
 *     total_amount: number,
 *     paid_amount: number,
 *     balance_amount: number,
 *     items: []
 *   }]
 * }
 */

async function testInvoicesApi() {
  console.log('\n========== TESTING INVOICES API ==========');
  console.log('Endpoint: GET /api/invoices');

  try {
    const response = await invoicesApi.getAll({ limit: 5, offset: 0 });
    console.log('Response status: SUCCESS');
    console.log('Response data structure:');
    console.log(JSON.stringify(response.data, null, 2));

    // Validate structure
    const data = response.data;
    if (data?.invoices && Array.isArray(data.invoices)) {
      console.log(`\nFound ${data.invoices.length} invoices`);
      if (data.invoices.length > 0) {
        const first = data.invoices[0];
        console.log('\nFirst invoice fields:');
        console.log('- invoice_id:', first.invoice_id);
        console.log('- invoice_number:', first.invoice_number);
        console.log('- invoice_date:', first.invoice_date);
        console.log('- customer_name:', first.customer_name);
        console.log('- final_amount:', first.final_amount);
        console.log('- payment_status:', first.payment_status);
      }
    } else {
      console.log('WARNING: Unexpected response structure');
    }
    return true;
  } catch (error: any) {
    console.log('Response status: FAILED');
    console.log('Error:', error.response?.status, error.response?.data || error.message);
    return false;
  }
}

async function testChallansApi() {
  console.log('\n========== TESTING CHALLANS API ==========');
  console.log('Endpoint: GET /api/challan');

  try {
    const response = await challansApi.getAll({ skip: 0, limit: 5 });
    console.log('Response status: SUCCESS');
    console.log('Response data structure:');
    console.log(JSON.stringify(response.data, null, 2));

    // Validate structure - challans returns DIRECT ARRAY
    const data = response.data;
    if (Array.isArray(data)) {
      console.log(`\nFound ${data.length} challans (direct array)`);
      if (data.length > 0) {
        const first = data[0];
        console.log('\nFirst challan fields:');
        console.log('- challan_id:', first.challan_id);
        console.log('- challan_number:', first.challan_number);
        console.log('- challan_date:', first.challan_date);
        console.log('- customer_name:', first.customer_name);
        console.log('- total_amount:', first.total_amount);
        console.log('- challan_status:', first.challan_status);
        console.log('- delivery_status:', first.delivery_status);
      }
    } else {
      console.log('WARNING: Expected direct array, got:', typeof data);
    }
    return true;
  } catch (error: any) {
    console.log('Response status: FAILED');
    console.log('Error:', error.response?.status, error.response?.data || error.message);
    return false;
  }
}

async function testSalesOrdersApi() {
  console.log('\n========== TESTING SALES ORDERS API ==========');
  console.log('Endpoint: GET /api/sales-orders');

  try {
    const response = await ordersApi.getAll({ skip: 0, limit: 5 });
    console.log('Response status: SUCCESS');
    console.log('Response data structure:');
    console.log(JSON.stringify(response.data, null, 2));

    // Validate structure
    const data = response.data;
    if (data?.orders && Array.isArray(data.orders)) {
      console.log(`\nFound ${data.orders.length} orders`);
      console.log('Total:', data.total);
      console.log('Page:', data.page);
      if (data.orders.length > 0) {
        const first = data.orders[0];
        console.log('\nFirst order fields:');
        console.log('- order_id:', first.order_id);
        console.log('- order_number:', first.order_number);
        console.log('- order_date:', first.order_date);
        console.log('- customer_name:', first.customer_name);
        console.log('- total_amount:', first.total_amount);
        console.log('- order_status:', first.order_status);
      }
    } else {
      console.log('WARNING: Unexpected response structure');
    }
    return true;
  } catch (error: any) {
    console.log('Response status: FAILED');
    console.log('Error:', error.response?.status, error.response?.data || error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('SALES API TEST SUITE');
  console.log('='.repeat(60));

  const results = {
    invoices: await testInvoicesApi(),
    challans: await testChallansApi(),
    salesOrders: await testSalesOrdersApi()
  };

  console.log('\n' + '='.repeat(60));
  console.log('TEST RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log('Invoices API:', results.invoices ? 'PASS' : 'FAIL');
  console.log('Challans API:', results.challans ? 'PASS' : 'FAIL');
  console.log('Sales Orders API:', results.salesOrders ? 'PASS' : 'FAIL');

  const allPassed = Object.values(results).every(r => r);
  console.log('\nOverall:', allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');

  return results;
}

// Export for use in other tests
export { testInvoicesApi, testChallansApi, testSalesOrdersApi, runAllTests };

// Run if executed directly
if (require.main === module) {
  runAllTests().catch(console.error);
}
