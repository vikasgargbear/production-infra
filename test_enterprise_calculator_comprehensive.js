/**
 * Comprehensive Test Suite for Enterprise Invoice Calculator
 * Tests ALL scenarios: free items, discounts, multiple products, edge cases
 */

// Import the calculator
const InvoiceCalculatorEnterprise = require('./frontend/src/services/invoiceCalculatorEnterprise.js').default;

console.log('🧪 COMPREHENSIVE ENTERPRISE CALCULATOR TEST\n');

// Test Scenario 1: Single product with free items (like your screenshot)
console.log('TEST 1: Single Product with Free Items');
const test1 = {
  items: [{
    quantity: 3,           // Total quantity customer receives
    free_quantity: 2,      // Free items given
    rate: 30.00,          // Rate per item
    discount_percent: 0,   // No discount
    gst_percent: 12       // 12% GST
  }]
};

const result1 = InvoiceCalculatorEnterprise.calculateLocally(test1);
console.log('Input: 3 qty (2 free), ₹30 rate, 0% discount, 12% GST');
console.log('Expected: Base qty=1, Subtotal=₹30, Tax=₹3.60, Total=₹33.60');
console.log('Actual:', {
  base_qty: result1.lineItems[0].base_quantity,
  subtotal: result1.lineItems[0].subtotal,
  tax: result1.lineItems[0].tax_amount,
  total: result1.lineItems[0].line_total
});
console.log('PASS:', result1.lineItems[0].line_total === 33.60 ? '✅' : '❌');
console.log('');

// Test Scenario 2: Multiple products with different free quantities and discounts
console.log('TEST 2: Multiple Products with Mixed Scenarios');
const test2 = {
  items: [
    {
      product_name: 'Product A',
      quantity: 5,           // 3 paid + 2 free
      free_quantity: 2,
      rate: 100.00,
      discount_percent: 10,  // 10% discount
      gst_percent: 12
    },
    {
      product_name: 'Product B', 
      quantity: 2,           // 2 paid + 0 free
      free_quantity: 0,
      rate: 50.00,
      discount_percent: 5,   // 5% discount
      gst_percent: 18        // 18% GST
    },
    {
      product_name: 'Product C',
      quantity: 10,          // 4 paid + 6 free
      free_quantity: 6,
      rate: 25.00,
      discount_percent: 0,   // No discount
      gst_percent: 12
    }
  ]
};

const result2 = InvoiceCalculatorEnterprise.calculateLocally(test2);
console.log('Input: 3 products with different free qty, discounts, GST rates');
result2.lineItems.forEach((item, i) => {
  const baseQty = test2.items[i].quantity - test2.items[i].free_quantity;
  const expectedSubtotal = baseQty * test2.items[i].rate;
  const expectedDiscount = (expectedSubtotal * test2.items[i].discount_percent) / 100;
  const expectedTaxable = expectedSubtotal - expectedDiscount;
  const expectedTax = (expectedTaxable * test2.items[i].gst_percent) / 100;
  const expectedTotal = expectedTaxable + expectedTax;
  
  console.log(`${test2.items[i].product_name}:`);
  console.log(`  Base Qty: ${item.base_quantity} (expected: ${baseQty})`);
  console.log(`  Subtotal: ₹${item.subtotal} (expected: ₹${expectedSubtotal})`);
  console.log(`  Discount: ₹${item.discount_amount} (expected: ₹${expectedDiscount})`);
  console.log(`  Tax: ₹${item.tax_amount} (expected: ₹${expectedTax.toFixed(2)})`);
  console.log(`  Total: ₹${item.line_total} (expected: ₹${expectedTotal.toFixed(2)})`);
  console.log(`  PASS: ${Math.abs(item.line_total - expectedTotal) < 0.01 ? '✅' : '❌'}`);
  console.log('');
});

console.log('Invoice Totals:');
console.log(`Total Tax: ₹${result2.totals.total_tax}`);
console.log(`Final Amount: ₹${result2.totals.final_amount}`);
console.log('');

// Test Scenario 3: Edge Cases
console.log('TEST 3: Edge Cases');

// Edge Case 1: All items are free
const test3a = {
  items: [{
    quantity: 5,
    free_quantity: 5,    // All items free
    rate: 100.00,
    discount_percent: 0,
    gst_percent: 12
  }]
};
const result3a = InvoiceCalculatorEnterprise.calculateLocally(test3a);
console.log('Edge Case 1: All items free');
console.log(`Expected: ₹0, Actual: ₹${result3a.lineItems[0].line_total}`);
console.log(`PASS: ${result3a.lineItems[0].line_total === 0 ? '✅' : '❌'}`);
console.log('');

// Edge Case 2: 100% discount
const test3b = {
  items: [{
    quantity: 3,
    free_quantity: 0,
    rate: 100.00,
    discount_percent: 100,  // 100% discount
    gst_percent: 12
  }]
};
const result3b = InvoiceCalculatorEnterprise.calculateLocally(test3b);
console.log('Edge Case 2: 100% discount');
console.log(`Expected: ₹0, Actual: ₹${result3b.lineItems[0].line_total}`);
console.log(`PASS: ${result3b.lineItems[0].line_total === 0 ? '✅' : '❌'}`);
console.log('');

// Edge Case 3: High GST rate
const test3c = {
  items: [{
    quantity: 1,
    free_quantity: 0,
    rate: 100.00,
    discount_percent: 0,
    gst_percent: 28    // 28% GST
  }]
};
const result3c = InvoiceCalculatorEnterprise.calculateLocally(test3c);
console.log('Edge Case 3: High GST (28%)');
console.log(`Expected: ₹128, Actual: ₹${result3c.lineItems[0].line_total}`);
console.log(`PASS: ${result3c.lineItems[0].line_total === 128 ? '✅' : '❌'}`);
console.log('');

// Test Scenario 4: Complex pharma business scenario
console.log('TEST 4: Complex Pharma Business Scenario');
const test4 = {
  items: [
    {
      product_name: 'Paracetamol 500mg (Strip of 10)',
      quantity: 12,          // Customer receives 12 strips  
      free_quantity: 2,      // 2 strips free (Buy 10 Get 2 Free scheme)
      rate: 15.00,          // ₹15 per strip
      discount_percent: 5,   // 5% trade discount
      gst_percent: 12       // 12% GST on medicines
    },
    {
      product_name: 'Amoxicillin 250mg (Strip of 10)', 
      quantity: 8,           // Customer receives 8 strips
      free_quantity: 1,      // 1 strip free (Buy 7 Get 1 Free)
      rate: 45.00,          // ₹45 per strip  
      discount_percent: 10,  // 10% bulk discount
      gst_percent: 12       // 12% GST on medicines
    }
  ],
  delivery_charges: 25.00   // Delivery charges
};

const result4 = InvoiceCalculatorEnterprise.calculateLocally(test4);
console.log('Complex Pharma Scenario:');
result4.lineItems.forEach((item, i) => {
  console.log(`${test4.items[i].product_name}:`);
  console.log(`  Customer gets: ${test4.items[i].quantity} strips (${test4.items[i].free_quantity} free)`);
  console.log(`  Pays for: ${item.base_quantity} strips`);
  console.log(`  Amount: ₹${item.line_total}`);
});
console.log(`Subtotal: ₹${result4.totals.taxable_amount}`);
console.log(`Tax: ₹${result4.totals.total_tax}`);
console.log(`Delivery: ₹${result4.totals.delivery_charges}`);
console.log(`Final Total: ₹${result4.totals.final_amount}`);
console.log('');

console.log('🎯 COMPREHENSIVE TEST COMPLETE');
console.log('If all tests show ✅, the enterprise calculator handles all scenarios correctly.');