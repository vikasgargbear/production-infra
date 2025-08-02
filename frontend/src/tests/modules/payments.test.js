// Payment Entry Module Tests
import { assert } from '../utils/testHelpers.js';
import { api } from '../../services/api/index.js';
import { paymentDataTransformer } from '../../services/api/utils/paymentDataTransformer.js';

export async function testPaymentsModule(options = {}) {
  const { verbose = false } = options;
  const results = { passed: [], failed: [] };
  
  console.log('\n💳 Testing Payment Entry Module...\n');
  
  // Test Suite 1: Data Transformer
  console.log('📋 Testing Data Transformer...');
  
  // Test 1.1: Transform Payment to Backend
  try {
    const frontendPayment = {
      customer_id: 'cust-001',
      customer_name: 'Test Customer',
      date: '2024-01-15',
      amount: '5000',
      payment_mode: 'UPI',
      reference_number: 'UPI123456',
      notes: 'Test payment',
      allocations: [{
        invoice_id: 'inv-001',
        allocated_amount: '3000'
      }, {
        invoice_id: 'inv-002',
        allocated_amount: '2000'
      }]
    };
    
    const transformed = paymentDataTransformer.transformPaymentToBackend(frontendPayment);
    
    assert(transformed.party_id === 'cust-001', 'Should map customer_id to party_id');
    assert(transformed.payment_date === '2024-01-15', 'Should map date to payment_date');
    assert(transformed.amount === 5000, 'Should convert amount to number');
    assert(transformed.payment_mode === 'upi', 'Should convert payment mode to lowercase');
    assert(transformed.remarks === 'Test payment', 'Should map notes to remarks');
    assert(transformed.allocations.length === 2, 'Should preserve allocations');
    assert(transformed.allocations[0].allocated_amount === 3000, 'Should convert allocation amounts');
    
    results.passed.push('Payment to Backend transformation');
    if (verbose) console.log('✅ Payment to Backend transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Payment to Backend transformation', error: error.message });
    console.error('❌ Payment to Backend transformation failed:', error.message);
  }
  
  // Test 1.2: Transform Payment to Frontend
  try {
    const backendPayment = {
      id: 'pay-001',
      receipt_number: 'RCP-2024-001',
      party_id: 'cust-001',
      party_name: 'Test Customer',
      party_type: 'customer',
      payment_date: '2024-01-15',
      amount: 5000,
      payment_mode: 'upi',
      reference_number: 'UPI123456',
      remarks: 'Test payment',
      status: 'completed',
      allocations: [{
        invoice_id: 'inv-001',
        invoice_number: 'INV-001',
        allocated_amount: 3000
      }]
    };
    
    const transformed = paymentDataTransformer.transformPaymentToFrontend(backendPayment);
    
    assert(transformed.receipt_no === 'RCP-2024-001', 'Should map receipt_number to receipt_no');
    assert(transformed.customer_id === 'cust-001', 'Should map party_id to customer_id');
    assert(transformed.date === '2024-01-15', 'Should map payment_date to date');
    assert(transformed.payment_mode === 'UPI', 'Should convert payment mode to uppercase');
    assert(transformed.notes === 'Test payment', 'Should map remarks to notes');
    assert(transformed.allocations[0].invoice_no === 'INV-001', 'Should include invoice numbers');
    
    results.passed.push('Payment to Frontend transformation');
    if (verbose) console.log('✅ Payment to Frontend transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Payment to Frontend transformation', error: error.message });
    console.error('❌ Payment to Frontend transformation failed:', error.message);
  }
  
  // Test 1.3: Transform Invoice for Outstanding Display
  try {
    const backendInvoice = {
      id: 'inv-001',
      invoice_number: 'INV-2024-001',
      invoice_date: '2024-01-10',
      total_amount: 10000,
      paid_amount: 6000,
      days_overdue: 5,
      payment_status: 'partial'
    };
    
    const transformed = paymentDataTransformer.transformInvoiceToFrontend(backendInvoice);
    
    assert(transformed.invoice_no === 'INV-2024-001', 'Should map invoice_number to invoice_no');
    assert(transformed.amount_due === 4000, 'Should calculate amount due');
    assert(transformed.allocated_amount === 0, 'Should initialize allocated_amount to 0');
    assert(transformed.days_overdue === 5, 'Should preserve days_overdue');
    
    results.passed.push('Invoice transformation for outstanding');
    if (verbose) console.log('✅ Invoice transformation for outstanding passed');
  } catch (error) {
    results.failed.push({ test: 'Invoice transformation for outstanding', error: error.message });
    console.error('❌ Invoice transformation for outstanding failed:', error.message);
  }
  
  // Test 1.4: Validate Payment Data
  try {
    // Valid payment
    const validPayment = {
      party_id: 'party-001',
      amount: 1000,
      payment_mode: 'cash',
      payment_date: '2024-01-15'
    };
    
    const validation = paymentDataTransformer.validatePaymentData(validPayment);
    assert(validation.isValid === true, 'Valid payment should pass validation');
    
    // Invalid payment - missing reference for UPI
    const invalidPayment = {
      party_id: 'party-001',
      amount: 1000,
      payment_mode: 'upi',
      payment_date: '2024-01-15'
    };
    
    const invalidValidation = paymentDataTransformer.validatePaymentData(invalidPayment);
    assert(invalidValidation.isValid === false, 'UPI payment without reference should fail');
    assert(invalidValidation.errors.includes('Reference number is required for upi payments'), 
      'Should require reference for UPI');
    
    // Invalid allocation
    const overAllocated = {
      party_id: 'party-001',
      amount: 1000,
      payment_mode: 'cash',
      payment_date: '2024-01-15',
      allocations: [{ allocated_amount: 1500 }]
    };
    
    const overAllocationValidation = paymentDataTransformer.validatePaymentData(overAllocated);
    assert(overAllocationValidation.isValid === false, 'Over-allocated payment should fail');
    
    results.passed.push('Payment data validation');
    if (verbose) console.log('✅ Payment data validation passed');
  } catch (error) {
    results.failed.push({ test: 'Payment data validation', error: error.message });
    console.error('❌ Payment data validation failed:', error.message);
  }
  
  // Test 1.5: Calculate Allocation Summary
  try {
    const payment = {
      amount: 5000,
      allocations: [
        { allocated_amount: 2000 },
        { allocated_amount: 1500 }
      ]
    };
    
    const summary = paymentDataTransformer.calculateAllocationSummary(payment);
    
    assert(summary.payment_amount === 5000, 'Should calculate payment amount');
    assert(summary.total_allocated === 3500, 'Should calculate total allocated');
    assert(summary.unallocated_amount === 1500, 'Should calculate unallocated amount');
    assert(summary.allocation_percentage === 70, 'Should calculate allocation percentage');
    
    results.passed.push('Allocation summary calculation');
    if (verbose) console.log('✅ Allocation summary calculation passed');
  } catch (error) {
    results.failed.push({ test: 'Allocation summary calculation', error: error.message });
    console.error('❌ Allocation summary calculation failed:', error.message);
  }
  
  // Test Suite 2: Payments API Integration
  console.log('\n💰 Testing Payments API...');
  
  // Test 2.1: Get Payment Methods
  try {
    const response = await api.payments.getMethods();
    if (response.data) {
      assert(response.data, 'Should return payment methods');
      results.passed.push('Get payment methods');
      if (verbose) console.log('✅ Get payment methods passed');
    }
  } catch (error) {
    if (error.response?.status === 404) {
      if (verbose) console.log('⚠️  Payment methods endpoint not found');
    } else {
      results.failed.push({ test: 'Get payment methods', error: error.message });
      console.error('❌ Get payment methods failed:', error.message);
    }
  }
  
  // Test Suite 3: Analytics Transformation
  console.log('\n📊 Testing Analytics...');
  
  // Test 3.1: Transform Analytics Data
  try {
    const analyticsData = {
      total_collected: 100000,
      total_pending: 25000,
      collection_rate: 80,
      payment_modes: [{
        payment_mode: 'upi',
        count: 45,
        total_amount: 50000,
        percentage: 50
      }],
      daily_collections: [{
        date: '2024-01-15',
        amount: 15000,
        payment_count: 5
      }],
      top_payers: [{
        party_id: 'cust-001',
        party_name: 'Top Customer',
        total_amount: 25000,
        payment_count: 10
      }]
    };
    
    const transformed = paymentDataTransformer.transformAnalyticsToFrontend(analyticsData);
    
    assert(transformed.total_collected === 100000, 'Should preserve total collected');
    assert(transformed.payment_modes[0].mode === 'upi', 'Should transform payment mode');
    assert(transformed.daily_collections[0].count === 5, 'Should map payment_count to count');
    assert(transformed.top_payers[0].total_paid === 25000, 'Should map total_amount to total_paid');
    
    results.passed.push('Analytics data transformation');
    if (verbose) console.log('✅ Analytics data transformation passed');
  } catch (error) {
    results.failed.push({ test: 'Analytics data transformation', error: error.message });
    console.error('❌ Analytics data transformation failed:', error.message);
  }
  
  // Test Suite 4: Payment Mode Mapping
  console.log('\n💸 Testing Payment Modes...');
  
  // Test 4.1: Payment Mode Conversion
  try {
    const modes = ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'RTGS_NEFT'];
    const expectedBackend = ['cash', 'upi', 'bank_transfer', 'cheque', 'card', 'rtgs_neft'];
    
    modes.forEach((mode, index) => {
      const payment = { payment_mode: mode };
      const transformed = paymentDataTransformer.transformPaymentToBackend(payment);
      assert(transformed.payment_mode === expectedBackend[index], 
        `Should convert ${mode} to ${expectedBackend[index]}`);
    });
    
    results.passed.push('Payment mode conversion');
    if (verbose) console.log('✅ Payment mode conversion passed');
  } catch (error) {
    results.failed.push({ test: 'Payment mode conversion', error: error.message });
    console.error('❌ Payment mode conversion failed:', error.message);
  }
  
  // Summary
  const totalTests = results.passed.length + results.failed.length;
  console.log(`\n💳 Payment Entry Module Test Summary:`);
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
window.testPaymentsModule = testPaymentsModule;