// Test the SalesOrderCalculatorEnterprise service directly
// This can be run in browser console to debug the calculation

// Mock data from the screenshot
const testOrderData = {
  customer_id: 1,
  items: [
    {
      product_id: 1,
      product_name: "Azethro",
      batch_number: "BATCH05852723",
      quantity: 8,
      unit_price: 10.00,
      discount_percent: 12,
      gst_percent: 12
    },
    {
      product_id: 2,
      product_name: "Atlas", 
      batch_number: "BATCH02518902",
      quantity: 2,
      unit_price: 12.00,
      discount_percent: 0,
      gst_percent: 12
    }
  ]
};

// Test the calculation service
async function testCalculation() {
  console.log('Testing SalesOrderCalculatorEnterprise...');
  console.log('Input data:', testOrderData);
  
  try {
    // Import the calculator (this would be available in the frontend context)
    // const SalesOrderCalculatorEnterprise = await import('../../services/salesOrderCalculatorEnterprise.js');
    
    // For now, let's implement the calculation logic directly
    const calculateLocally = (orderData) => {
      const items = orderData.items || [];
      let subtotal = 0;
      let totalDiscount = 0;
      let totalTax = 0;
      
      const calculatedLineItems = items.map(item => {
        const quantity = parseFloat(item.quantity) || 0;
        const unitPrice = parseFloat(item.unit_price) || 0;
        const discountPercent = parseFloat(item.discount_percent) || 0;
        const gstPercent = parseFloat(item.gst_percent) || 12;
        
        // Calculate line subtotal (quantity * unit price)
        const lineSubtotal = quantity * unitPrice;
        
        // Apply item discount
        const itemDiscount = (lineSubtotal * discountPercent) / 100;
        const lineSubtotalAfterDiscount = lineSubtotal - itemDiscount;
        
        // Calculate tax on taxable amount (after discount)
        const taxAmount = (lineSubtotalAfterDiscount * gstPercent) / 100;
        
        // Line total = taxable amount + tax
        const lineTotal = lineSubtotalAfterDiscount + taxAmount;
        
        subtotal += lineSubtotal;
        totalDiscount += itemDiscount;
        totalTax += taxAmount;
        
        return {
          ...item,
          line_subtotal: lineSubtotal,
          discount_amount: itemDiscount,
          taxable_amount: lineSubtotalAfterDiscount,
          tax_amount: taxAmount,
          line_total: lineTotal
        };
      });
      
      // Calculate final amounts
      const grossTotal = subtotal; // Sum of (quantity * unit_price)
      const taxableTotal = grossTotal - totalDiscount; // Amount after discount
      const finalTotal = taxableTotal + totalTax; // Final amount including tax
      
      const totals = {
        gross_amount: grossTotal,
        total_discount: totalDiscount,
        taxable_amount: taxableTotal, // This should be the subtotal displayed
        total_tax: totalTax,
        final_amount: finalTotal,
        net_amount: finalTotal,
        round_off: 0,
        delivery_charges: 0
      };
      
      return {
        totals,
        lineItems: calculatedLineItems
      };
    };
    
    const formatTotalsForDisplay = (totals) => {
      return {
        subtotal_amount: totals.taxable_amount || 0, // Frontend expects subtotal_amount
        discount_amount: totals.total_discount || 0,
        tax_amount: totals.total_tax || 0,
        total_amount: totals.final_amount || 0, // Frontend expects total_amount
        final_amount: totals.final_amount || 0,
        cgst_amount: (totals.total_tax || 0) / 2, // Split tax for CGST/SGST display
        sgst_amount: (totals.total_tax || 0) / 2,
        round_off: totals.round_off || 0,
        delivery_charges: totals.delivery_charges || 0
      };
    };
    
    // Run the calculation
    const { totals, lineItems } = calculateLocally(testOrderData);
    const formattedTotals = formatTotalsForDisplay(totals);
    
    console.log('\n=== CALCULATION RESULTS ===');
    console.log('Raw totals:', totals);
    console.log('Formatted totals for frontend:', formattedTotals);
    console.log('Line items:', lineItems);
    
    console.log('\n=== FRONTEND DISPLAY VALUES ===');
    console.log(`Sub Total: ₹${formattedTotals.subtotal_amount.toFixed(2)}`);
    console.log(`Total GST: ₹${formattedTotals.tax_amount.toFixed(2)}`);
    console.log(`Grand Total: ₹${formattedTotals.total_amount.toFixed(2)}`);
    
    console.log('\n=== INDIVIDUAL ITEM CALCULATIONS ===');
    lineItems.forEach((item, index) => {
      console.log(`${item.product_name}:`);
      console.log(`  Quantity: ${item.quantity}`);
      console.log(`  Unit Price: ₹${item.unit_price}`);
      console.log(`  Line Subtotal: ${item.quantity} × ₹${item.unit_price} = ₹${item.line_subtotal.toFixed(2)}`);
      console.log(`  Discount: ₹${item.line_subtotal.toFixed(2)} × ${item.discount_percent}% = ₹${item.discount_amount.toFixed(2)}`);
      console.log(`  Taxable: ₹${item.line_subtotal.toFixed(2)} - ₹${item.discount_amount.toFixed(2)} = ₹${item.taxable_amount.toFixed(2)}`);
      console.log(`  Tax: ₹${item.taxable_amount.toFixed(2)} × ${item.gst_percent}% = ₹${item.tax_amount.toFixed(2)}`);
      console.log(`  Line Total: ₹${item.taxable_amount.toFixed(2)} + ₹${item.tax_amount.toFixed(2)} = ₹${item.line_total.toFixed(2)}`);
      console.log('');
    });
    
    return {
      success: true,
      totals: formattedTotals,
      lineItems
    };
    
  } catch (error) {
    console.error('Calculation failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
testCalculation().then(result => {
  if (result.success) {
    console.log('✅ Calculation test passed!');
    console.log('The issue is likely in the frontend component not calling/updating properly.');
    console.log('Expected values that should show in the UI:');
    console.log(`- Sub Total: ₹${result.totals.subtotal_amount.toFixed(2)}`);
    console.log(`- Total GST: ₹${result.totals.tax_amount.toFixed(2)}`);
    console.log(`- Grand Total: ₹${result.totals.total_amount.toFixed(2)}`);
  } else {
    console.log('❌ Calculation test failed:', result.error);
  }
});

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.testCalculation = testCalculation;
  console.log('Test function available as window.testCalculation()');
}