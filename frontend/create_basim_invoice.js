// Script to create Basim invoice through frontend API
// Customer: Basim, phone 7738228969
// Product: Atlas, quantity 12, 10% discount, ₹20 transportation, cash payment

const API_BASE = 'https://pharma-backend-production-0c09.up.railway.app/api';
const ORG_ID = '11111111-1111-1111-1111-111111111111';

async function createBasimInvoice() {
  console.log('Creating invoice for Basim...\n');
  
  try {
    // Step 1: Search for or create customer
    console.log('1. Finding/Creating customer Basim...');
    let customerResponse = await fetch(`${API_BASE}/customers?search=Basim&limit=10`, {
      headers: {
        'X-Org-Id': ORG_ID
      }
    });
    
    let customerData = await customerResponse.json();
    let customer;
    
    if (customerData.customers && customerData.customers.length > 0) {
      customer = customerData.customers[0];
      console.log(`   ✅ Found existing customer: ${customer.customer_name}`);
    } else {
      // Create new customer
      const newCustomer = {
        customer_name: 'Basim',
        customer_type: 'retail',
        primary_phone: '7738228969',
        primary_email: 'basim@example.com',
        state: 'Maharashtra',
        city: 'Mumbai',
        credit_limit: 50000,
        credit_period_days: 30
      };
      
      const createResponse = await fetch(`${API_BASE}/customers`, {
        method: 'POST',
        headers: {
          'X-Org-Id': ORG_ID,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newCustomer)
      });
      
      customer = await createResponse.json();
      console.log(`   ✅ Created new customer: Basim`);
    }
    
    // Step 2: Create invoice with hardcoded product
    console.log('\n2. Creating invoice...');
    
    const invoiceData = {
      customer_id: customer.customer_id || 1,
      customer_name: 'Basim',
      primary_phone: '7738228969',
      invoice_date: new Date().toISOString(),
      payment_method: 'cash',
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
      discount_percentage: 10,
      other_charges: 20,
      other_charges_description: 'Transportation',
      net_amount: 1294.40,
      paid_amount: 1294.40,
      notes: 'Cash sale - Basim (Atlas product)'
    };
    
    console.log(`   Invoice Summary:`);
    console.log(`   - Product: Atlas Tablet`);
    console.log(`   - Quantity: 12 units`);
    console.log(`   - Unit Price: ₹100`);
    console.log(`   - Subtotal: ₹1,200`);
    console.log(`   - Discount: ₹120 (10%)`);
    console.log(`   - GST: ₹194.40 (18%)`);
    console.log(`   - Transportation: ₹20`);
    console.log(`   - Total: ₹1,294.40`);
    console.log(`   - Payment: Cash (Paid in full)`);
    
    const invoiceResponse = await fetch(`${API_BASE}/invoices`, {
      method: 'POST',
      headers: {
        'X-Org-Id': ORG_ID,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(invoiceData)
    });
    
    if (invoiceResponse.ok) {
      const invoice = await invoiceResponse.json();
      console.log(`\n✅ Invoice created successfully!`);
      console.log(`   Invoice Number: ${invoice.invoice_number || 'N/A'}`);
      console.log(`   Invoice ID: ${invoice.invoice_id || 'N/A'}`);
      console.log(`   Total Amount: ₹${invoice.total_amount || invoiceData.net_amount}`);
      return invoice;
    } else {
      const error = await invoiceResponse.text();
      console.log(`\n❌ Failed to create invoice: ${invoiceResponse.status}`);
      console.log(`   Error: ${error.substring(0, 200)}`);
      return null;
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    return null;
  }
}

// Run the script
createBasimInvoice().then(invoice => {
  if (invoice) {
    console.log('\n========================================');
    console.log('✅ BASIM INVOICE CREATED SUCCESSFULLY!');
    console.log('========================================');
  }
});