/**
 * Test Invoice API Integration
 * Verifies calculation flow with backend API
 */

const API_BASE = 'https://pharma-backend-production-0c09.up.railway.app/api';

async function testInvoiceCalculations() {
  console.log('=== TESTING INVOICE API CALCULATIONS ===\n');
  
  // Test invoice data
  const invoiceData = {
    customer_id: 1,
    items: [
      {
        product_id: 1,
        product_name: 'Test Product 1',
        base_quantity: 3,
        free_quantity: 2,
        quantity: 5, // total
        rate: 30,
        sale_price: 30,
        discount_percent: 10,
        gst_percent: 12
      },
      {
        product_id: 2,
        product_name: 'Test Product 2',
        base_quantity: 5,
        free_quantity: 1,
        quantity: 6,
        rate: 50,
        sale_price: 50,
        discount_percent: 15,
        gst_percent: 18
      }
    ],
    gst_type: 'CGST/SGST',
    delivery_charges: 25
  };
  
  try {
    // Test calculation endpoint
    console.log('Testing /calculations/invoice endpoint...');
    const calcResponse = await fetch(`${API_BASE}/calculations/invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: invoiceData.customer_id,
        items: invoiceData.items.map(item => ({
          product_id: item.product_id,
          quantity: item.base_quantity,
          free_quantity: item.free_quantity,
          unit_price: item.rate,
          discount_percent: item.discount_percent,
          gst_percent: item.gst_percent
        })),
        gst_type: invoiceData.gst_type,
        delivery_charges: invoiceData.delivery_charges
      })
    });
    
    if (calcResponse.ok) {
      const result = await calcResponse.json();
      console.log('✓ Calculation API Response:');
      console.log('  Line Items:', result.line_items?.length || 0);
      console.log('  Totals:', result.totals);
      console.log('  Final Amount: ₹', result.totals?.final_amount || 0);
    } else {
      console.log('✗ Calculation API failed:', calcResponse.status);
    }
    
    // Test create invoice
    console.log('\nTesting invoice creation...');
    const createData = {
      ...invoiceData,
      invoice_date: new Date().toISOString().split('T')[0],
      payment_terms: 'Net 30',
      notes: 'Test invoice with calculations'
    };
    
    const createResponse = await fetch(`${API_BASE}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createData)
    });
    
    if (createResponse.ok) {
      const invoice = await createResponse.json();
      console.log('✓ Invoice created successfully');
      console.log('  Invoice ID:', invoice.id);
      console.log('  Total Amount: ₹', invoice.total_amount);
      
      // Verify calculations
      console.log('\nVerifying item calculations:');
      if (invoice.items) {
        invoice.items.forEach((item, i) => {
          console.log(`  Item ${i + 1}: ${item.product_name}`);
          console.log(`    Base: ${item.base_quantity} × ₹${item.rate} = ₹${item.subtotal}`);
          console.log(`    Discount: ${item.discount_percent}% = ₹${item.discount_amount}`);
          console.log(`    Tax: ${item.gst_percent}% = ₹${item.tax_amount}`);
          console.log(`    Total: ₹${item.line_total}`);
        });
      }
    } else {
      const error = await createResponse.text();
      console.log('✗ Invoice creation failed:', error);
    }
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
  
  console.log('\n=== TEST COMPLETED ===');
}

// Run the test
testInvoiceCalculations();