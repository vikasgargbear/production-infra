// Debug utility for invoice issues
const debugInvoice = () => {
  // Get last failed invoice from localStorage
  const failedInvoice = localStorage.getItem('lastFailedInvoice');
  
  if (failedInvoice) {
    const data = JSON.parse(failedInvoice);
    console.log('=== LAST FAILED INVOICE ===');
    console.log('Timestamp:', data.timestamp);
    console.log('Error:', data.error);
    console.log('Invoice Data:', data.invoiceData);
    
    // Check for common issues
    console.log('\n=== VALIDATION CHECKS ===');
    
    // Check customer_id
    if (!data.invoiceData.customer_id || isNaN(data.invoiceData.customer_id)) {
      console.error('❌ Invalid customer_id:', data.invoiceData.customer_id);
    } else {
      console.log('✅ customer_id:', data.invoiceData.customer_id);
    }
    
    // Check items
    if (!data.invoiceData.items || data.invoiceData.items.length === 0) {
      console.error('❌ No items in invoice');
    } else {
      data.invoiceData.items.forEach((item, index) => {
        console.log(`\nItem ${index + 1}:`);
        if (!item.product_id || isNaN(item.product_id)) {
          console.error(`  ❌ Invalid product_id: ${item.product_id}`);
        } else {
          console.log(`  ✅ product_id: ${item.product_id}`);
        }
        console.log(`  - quantity: ${item.quantity}`);
        console.log(`  - unit_price: ${item.unit_price}`);
        console.log(`  - line_total: ${item.line_total}`);
      });
    }
    
    // Create minimal test payload
    console.log('\n=== MINIMAL TEST PAYLOAD ===');
    const minimalPayload = {
      customer_id: data.invoiceData.customer_id,
      payment_terms: data.invoiceData.payment_terms || 'cash',
      delivery_priority: 'normal',
      items: data.invoiceData.items.map(item => ({
        product_id: item.product_id,
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        line_total: item.line_total || item.quantity * item.unit_price,
        discount_percent: item.discount_percent || 0,
        gst_percent: item.gst_percent || 12
      }))
    };
    console.log('Minimal payload to test:', JSON.stringify(minimalPayload, null, 2));
    
    // Generate curl command for testing
    const curlCommand = `curl -X POST https://pharma-backend-production-0c09.up.railway.app/api/invoices/ \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(minimalPayload)}'`;
    
    console.log('\n=== TEST WITH CURL ===');
    console.log(curlCommand);
    
    return data;
  } else {
    console.log('No failed invoice found in localStorage');
    return null;
  }
};

// Make it available globally for testing
window.debugInvoice = debugInvoice;

export default debugInvoice;