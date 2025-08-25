/**
 * Test calculation with your exact data
 */

const testItems = [
  {
    product_name: 'iPhone',
    quantity: 2,
    base_quantity: 2,
    free_quantity: 1,
    rate: 20,
    sale_price: 20,
    mrp: 25,
    discount_percent: 20,
    gst_percent: 12
  },
  {
    product_name: 'Airpods Pro',
    quantity: 1,
    base_quantity: 1,
    free_quantity: 0,
    rate: 40,
    sale_price: 40,
    mrp: 45,
    discount_percent: 25,
    gst_percent: 12
  }
];

export const runTestCalculation = () => {
  console.log('=== TEST CALCULATION ===');
  
  let grossTotal = 0;
  let taxableTotal = 0;
  let taxTotal = 0;
  
  testItems.forEach(item => {
    const qty = item.base_quantity || item.quantity;
    const rate = item.rate || item.sale_price;
    const discountPercent = item.discount_percent;
    
    const gross = qty * rate;
    const discount = (gross * discountPercent) / 100;
    const taxable = gross - discount;
    const tax = (taxable * item.gst_percent) / 100;
    const lineTotal = taxable + tax;
    
    console.log(`${item.product_name}:`);
    console.log(`  ${qty} × ₹${rate} = ₹${gross}`);
    console.log(`  Discount ${discountPercent}%: -₹${discount}`);
    console.log(`  Taxable: ₹${taxable}`);
    console.log(`  Tax ${item.gst_percent}%: ₹${tax}`);
    console.log(`  Line Total: ₹${lineTotal}`);
    
    grossTotal += gross;
    taxableTotal += taxable;
    taxTotal += tax;
  });
  
  console.log('\nTOTALS:');
  console.log(`  Gross: ₹${grossTotal} (should be ₹80)`);
  console.log(`  Taxable: ₹${taxableTotal} (should be ₹62)`);
  console.log(`  Tax: ₹${taxTotal.toFixed(2)} (should be ₹7.44)`);
  console.log(`  Pre-round: ₹${(taxableTotal + taxTotal).toFixed(2)} (should be ₹69.44)`);
  console.log(`  Final: ₹${Math.round(taxableTotal + taxTotal)} (should be ₹69)`);
  console.log(`  Round off: ₹${(Math.round(taxableTotal + taxTotal) - (taxableTotal + taxTotal)).toFixed(2)} (should be -₹0.44)`);
  
  return {
    gross: grossTotal,
    taxable: taxableTotal,
    tax: taxTotal,
    final: Math.round(taxableTotal + taxTotal)
  };
};