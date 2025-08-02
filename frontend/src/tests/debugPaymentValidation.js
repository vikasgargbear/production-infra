// Debug script for payment validation issue
// Run this file directly with node to debug the payment validation

console.log('=== Payment Validation Debug ===\n');

// Test 1: Multi-payment mode structure (from EnterprisePaymentEntry)
const multiPaymentData = {
  customer_id: 123,
  payment_type: 'order_payment',
  payment_date: '2025-07-24',
  total_amount: 1000,
  payment_modes: [
    {
      mode: 'cash',
      amount: 600
    },
    {
      mode: 'upi',
      amount: 400
    }
  ],
  remarks: 'Test payment',
  collector_name: 'John Doe',
  route: 'Route A',
  invoice_allocations: []
};

console.log('Test 1: Multi-payment mode structure');
console.log('Input:', JSON.stringify(multiPaymentData, null, 2));

try {
  const transformed = paymentDataTransformer.transformPaymentToBackend(multiPaymentData);
  console.log('\nTransformed:', JSON.stringify(transformed, null, 2));
  
  const validation = paymentDataTransformer.validatePaymentData(transformed);
  console.log('\nValidation result:', validation);
  
  if (!validation.isValid) {
    console.log('Validation errors:', validation.errors);
  }
} catch (error) {
  console.error('Error:', error.message);
}

console.log('\n' + '='.repeat(50) + '\n');

// Test 2: Single payment mode structure (legacy)
const singlePaymentData = {
  customer_id: 123,
  payment_date: '2025-07-24',
  amount: 1000,
  payment_mode: 'cash',
  remarks: 'Test payment'
};

console.log('Test 2: Single payment mode structure (legacy)');
console.log('Input:', JSON.stringify(singlePaymentData, null, 2));

try {
  const transformed = paymentDataTransformer.transformPaymentToBackend(singlePaymentData);
  console.log('\nTransformed:', JSON.stringify(transformed, null, 2));
  
  const validation = paymentDataTransformer.validatePaymentData(transformed);
  console.log('\nValidation result:', validation);
  
  if (!validation.isValid) {
    console.log('Validation errors:', validation.errors);
  }
} catch (error) {
  console.error('Error:', error.message);
}

console.log('\n' + '='.repeat(50) + '\n');

// Test 3: Empty payment modes
const emptyPaymentModes = {
  customer_id: 123,
  payment_type: 'order_payment',
  payment_date: '2025-07-24',
  total_amount: 0,
  payment_modes: [
    {
      mode: '',
      amount: ''
    }
  ],
  remarks: 'Test payment'
};

console.log('Test 3: Empty payment modes (should fail)');
console.log('Input:', JSON.stringify(emptyPaymentModes, null, 2));

try {
  const transformed = paymentDataTransformer.transformPaymentToBackend(emptyPaymentModes);
  console.log('\nTransformed:', JSON.stringify(transformed, null, 2));
  
  const validation = paymentDataTransformer.validatePaymentData(transformed);
  console.log('\nValidation result:', validation);
  
  if (!validation.isValid) {
    console.log('Validation errors:', validation.errors);
  }
} catch (error) {
  console.error('Error:', error.message);
}