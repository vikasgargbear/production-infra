/**
 * Debug calculation to find where the issue is
 */
export const debugCalculation = (items) => {
  console.log('=== DEBUG CALCULATION START ===');
  console.log('Input items:', items);
  
  let totalGrossAmount = 0;
  let totalTaxableAmount = 0;
  let totalTax = 0;
  
  items.forEach((item, index) => {
    const quantity = parseFloat(item.quantity || item.base_quantity) || 0;
    const rate = parseFloat(item.rate || item.sale_price) || 0;
    const discountPercent = parseFloat(item.discount_percent) || 0;
    const freeQuantity = parseFloat(item.free_quantity) || 0;
    const gstPercent = parseFloat(item.gst_percent || item.tax_rate) || 12;
    
    const grossAmount = quantity * rate;
    const discountAmount = (grossAmount * discountPercent) / 100;
    const taxableAmount = grossAmount - discountAmount;
    const taxAmount = (taxableAmount * gstPercent) / 100;
    const lineTotal = taxableAmount + taxAmount;
    
    console.log(`Item ${index + 1} (${item.product_name}):`);
    console.log(`  Quantity: ${quantity} (+ ${freeQuantity} free)`);
    console.log(`  Rate: ₹${rate}`);
    console.log(`  Gross: ${quantity} × ₹${rate} = ₹${grossAmount}`);
    console.log(`  Discount: ${discountPercent}% of ₹${grossAmount} = ₹${discountAmount}`);
    console.log(`  Taxable: ₹${grossAmount} - ₹${discountAmount} = ₹${taxableAmount}`);
    console.log(`  Tax: ${gstPercent}% of ₹${taxableAmount} = ₹${taxAmount}`);
    console.log(`  Line Total: ₹${taxableAmount} + ₹${taxAmount} = ₹${lineTotal}`);
    
    totalGrossAmount += grossAmount;
    totalTaxableAmount += taxableAmount;
    totalTax += taxAmount;
  });
  
  console.log('\n=== TOTALS ===');
  console.log(`Gross Amount: ₹${totalGrossAmount}`);
  console.log(`Taxable Amount: ₹${totalTaxableAmount}`);
  console.log(`Total Tax: ₹${totalTax}`);
  console.log(`Pre-Round Total: ₹${totalTaxableAmount + totalTax}`);
  console.log(`Rounded: ₹${Math.round(totalTaxableAmount + totalTax)}`);
  console.log(`Round Off: ₹${Math.round(totalTaxableAmount + totalTax) - (totalTaxableAmount + totalTax)}`);
  console.log('=== DEBUG CALCULATION END ===');
  
  return {
    grossAmount: totalGrossAmount,
    taxableAmount: totalTaxableAmount,
    totalTax: totalTax,
    finalAmount: Math.round(totalTaxableAmount + totalTax)
  };
};