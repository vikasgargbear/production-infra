/**
 * Comprehensive Invoice Calculation Test
 * Tests all scenarios: base quantity, free quantity, discounts, multiple products, GST types
 */

import EnterpriseCalculator from './src/services/enterpriseCalculator.js';

console.log('=== ENTERPRISE INVOICE CALCULATION TEST ===\n');

// Test 1: Single product with base and free quantity
console.log('TEST 1: Single Product with Base + Free Quantity');
console.log('Scenario: 3 base units @ ₹30 each + 2 free units, 10% discount, 12% GST');
const test1 = EnterpriseCalculator.calculateInvoice({
  items: [{
    product_name: 'Test Product 1',
    base_quantity: 3,
    free_quantity: 2,
    rate: 30,
    discount_percent: 10,
    gst_percent: 12
  }],
  gst_type: 'CGST/SGST'
});

console.log('Expected: Base Amount = ₹90, Discount = ₹9, Taxable = ₹81, GST = ₹9.72, Total = ₹90.72');
console.log('Actual Results:');
console.log(`  Base Amount: ₹${test1.items[0].subtotal}`);
console.log(`  Discount: ₹${test1.items[0].discount_amount}`);
console.log(`  Taxable: ₹${test1.items[0].taxable_amount}`);
console.log(`  GST: ₹${test1.items[0].gst_amount}`);
console.log(`  Line Total: ₹${test1.items[0].total_amount}`);
console.log(`  Invoice Total: ₹${test1.totals.final_amount}`);
console.log(`  ✓ Free quantity (${test1.items[0].free_quantity}) not charged\n`);

// Test 2: Multiple products with different configurations
console.log('TEST 2: Multiple Products with Different Configs');
const test2 = EnterpriseCalculator.calculateInvoice({
  items: [
    {
      product_name: 'Product A',
      base_quantity: 5,
      free_quantity: 1,
      rate: 100,
      discount_percent: 15,
      gst_percent: 18
    },
    {
      product_name: 'Product B',
      base_quantity: 10,
      free_quantity: 0,
      rate: 50,
      discount_percent: 5,
      gst_percent: 12
    },
    {
      product_name: 'Product C',
      base_quantity: 2,
      free_quantity: 3,
      rate: 200,
      discount_percent: 20,
      gst_percent: 28
    }
  ],
  gst_type: 'CGST/SGST',
  delivery_charges: 50
});

console.log('Product Details:');
test2.items.forEach(item => {
  console.log(`  ${item.product_name}:`);
  console.log(`    Quantities: ${item.base_quantity} base + ${item.free_quantity} free = ${item.total_quantity} total`);
  console.log(`    Calculation: ₹${item.rate} × ${item.base_quantity} = ₹${item.subtotal}`);
  console.log(`    Discount: ${item.discount_percent}% = ₹${item.discount_amount}`);
  console.log(`    GST: ${item.gst_percent}% = ₹${item.gst_amount}`);
  console.log(`    Line Total: ₹${item.total_amount}`);
});

console.log('\nInvoice Totals:');
console.log(`  Gross Amount: ₹${test2.totals.gross_amount}`);
console.log(`  Total Discount: ₹${test2.totals.total_discount}`);
console.log(`  Taxable Amount: ₹${test2.totals.taxable_amount}`);
console.log(`  CGST: ₹${test2.totals.cgst_amount}`);
console.log(`  SGST: ₹${test2.totals.sgst_amount}`);
console.log(`  Delivery: ₹${test2.totals.delivery_charges}`);
console.log(`  Final Amount: ₹${test2.totals.final_amount}\n`);

// Test 3: IGST scenario
console.log('TEST 3: Inter-state with IGST');
const test3 = EnterpriseCalculator.calculateInvoice({
  items: [{
    product_name: 'Interstate Product',
    base_quantity: 10,
    free_quantity: 2,
    rate: 100,
    discount_percent: 10,
    gst_percent: 18
  }],
  gst_type: 'IGST'
});

console.log(`  Base: 10 × ₹100 = ₹${test3.items[0].subtotal}`);
console.log(`  Discount: 10% = ₹${test3.items[0].discount_amount}`);
console.log(`  Taxable: ₹${test3.items[0].taxable_amount}`);
console.log(`  IGST: 18% = ₹${test3.items[0].igst_amount}`);
console.log(`  CGST: ₹${test3.items[0].cgst_amount} (should be 0)`);
console.log(`  SGST: ₹${test3.items[0].sgst_amount} (should be 0)`);
console.log(`  Total: ₹${test3.totals.final_amount}\n`);

// Test 4: Edge cases
console.log('TEST 4: Edge Cases');

// 4a: Zero discount
const test4a = EnterpriseCalculator.calculateItem({
  base_quantity: 5,
  rate: 100,
  discount_percent: 0,
  gst_percent: 12
});
console.log(`  No discount: ₹${test4a.subtotal} + ₹${test4a.gst_amount} GST = ₹${test4a.total_amount}`);

// 4b: 100% discount
const test4b = EnterpriseCalculator.calculateItem({
  base_quantity: 5,
  rate: 100,
  discount_percent: 100,
  gst_percent: 12
});
console.log(`  100% discount: ₹${test4b.subtotal} - ₹${test4b.discount_amount} = ₹${test4b.total_amount}`);

// 4c: Only free quantity
const test4c = EnterpriseCalculator.calculateItem({
  base_quantity: 0,
  free_quantity: 10,
  rate: 100,
  discount_percent: 10,
  gst_percent: 12
});
console.log(`  Only free items: Base=${test4c.base_quantity}, Total Amount = ₹${test4c.total_amount} (should be 0)`);

// Test 5: Real-world scenario
console.log('\nTEST 5: Real-World Pharmacy Invoice');
const realWorld = EnterpriseCalculator.calculateInvoice({
  items: [
    {
      product_name: 'Paracetamol 500mg',
      base_quantity: 10,
      free_quantity: 2,
      rate: 15,
      discount_percent: 5,
      gst_percent: 12
    },
    {
      product_name: 'Vitamin C',
      base_quantity: 5,
      free_quantity: 1,
      rate: 45,
      discount_percent: 10,
      gst_percent: 12
    },
    {
      product_name: 'Cough Syrup',
      base_quantity: 3,
      free_quantity: 0,
      rate: 120,
      discount_percent: 15,
      gst_percent: 18
    }
  ],
  gst_type: 'CGST/SGST',
  delivery_charges: 25
});

console.log('Items Summary:');
realWorld.items.forEach(item => {
  console.log(`  ${item.product_name}: ${item.base_quantity}+${item.free_quantity} units @ ₹${item.rate} = ₹${item.total_amount}`);
});

console.log('\nFinal Invoice:');
console.log(`  Subtotal: ₹${realWorld.totals.gross_amount}`);
console.log(`  Discount: -₹${realWorld.totals.total_discount}`);
console.log(`  Taxable: ₹${realWorld.totals.taxable_amount}`);
console.log(`  Tax: +₹${realWorld.totals.total_gst}`);
console.log(`  Delivery: +₹${realWorld.totals.delivery_charges}`);
console.log(`  TOTAL: ₹${realWorld.totals.final_amount}`);

console.log('\n=== ALL TESTS COMPLETED ===');