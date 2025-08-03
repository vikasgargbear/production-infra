// Simplified Basim invoice creation - no GET calls
const API_BASE = 'https://pharma-backend-production-0c09.up.railway.app/api';
const ORG_ID = '11111111-1111-1111-1111-111111111111';

async function createSimpleInvoice() {
  console.log('Creating Simple Invoice for Basim\n');
  console.log('=' + '='.repeat(50));
  
  // Direct invoice creation without customer lookup
  const invoiceData = {
    customer_id: 1, // Using ID 1 directly
    customer_name: 'Basim',
    primary_phone: '7738228969',
    invoice_date: new Date().toISOString(),
    invoice_type: 'tax_invoice',
    payment_method: 'cash',
    payment_terms: 'cash',
    place_of_supply: 'Maharashtra',
    items: [
      {
        product_id: 1,
        product_name: 'Atlas Tablet',
        product_code: 'ATL001',
        hsn_code: '3004',
        quantity: 12,
        unit_price: 100,
        mrp: 120,
        discount_percentage: 10,
        discount_amount: 120,
        gst_percentage: 18,
        cgst_amount: 97.20,
        sgst_amount: 97.20,
        igst_amount: 0,
        line_total: 1080,
        line_total_with_tax: 1274.40
      }
    ],
    subtotal_amount: 1200,
    discount_amount: 120,
    taxable_amount: 1080,
    cgst_amount: 97.20,
    sgst_amount: 97.20,
    igst_amount: 0,
    total_tax_amount: 194.40,
    other_charges: 20,
    final_amount: 1294.40,
    total_amount: 1294.40,
    net_amount: 1294.40,
    paid_amount: 1294.40,
    notes: 'Cash sale - Basim (Atlas product)'
  };
  
  console.log('\nInvoice Details:');
  console.log('Customer: Basim (7738228969)');
  console.log('Product: Atlas Tablet x 12');
  console.log('Subtotal: ₹1,200');
  console.log('Discount: ₹120 (10%)');
  console.log('GST: ₹194.40');
  console.log('Transport: ₹20');
  console.log('Total: ₹1,294.40');
  console.log('\nSending invoice to backend...');
  
  try {
    const response = await fetch(`${API_BASE}/invoices`, {
      method: 'POST',
      headers: {
        'X-Org-Id': ORG_ID,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(invoiceData)
    });
    
    const responseText = await response.text();
    console.log('\nResponse Status:', response.status);
    
    if (response.ok) {
      try {
        const invoice = JSON.parse(responseText);
        console.log('\n✅ SUCCESS! Invoice created:');
        console.log('Invoice Number:', invoice.invoice_number || 'Generated');
        console.log('Invoice ID:', invoice.invoice_id || 'Generated');
        return invoice;
      } catch (e) {
        console.log('✅ Invoice likely created (response parsing issue)');
        console.log('Response:', responseText.substring(0, 200));
      }
    } else {
      console.log('❌ Failed to create invoice');
      console.log('Error:', responseText.substring(0, 300));
    }
  } catch (error) {
    console.error('❌ Network Error:', error.message);
  }
}

// Run it
createSimpleInvoice().then(() => {
  console.log('\n' + '='.repeat(50));
  console.log('Test Complete');
});