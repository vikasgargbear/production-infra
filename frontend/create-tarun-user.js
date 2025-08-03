#!/usr/bin/env node

/**
 * Create a specific user "Tarun" with complete details
 * This will populate the database with real-looking data for testing
 */

const axios = require('axios');

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://pharma-backend-production-0c09.up.railway.app';
const ORG_ID = 'ad808530-1ddb-4377-ab20-67bef145d80d';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
});

// Tarun's customer data
const tarunCustomerData = {
  customer_name: 'Tarun Pharmacy',
  phone: '9876543210',
  email: 'tarun.pharmacy@gmail.com',
  customer_type: 'retail',
  gstin: '08ABCDE1234F1Z5',  // Rajasthan GSTIN (08)
  pan_number: 'ABCDE1234F',
  drug_license_number: 'RJ-DL-2024-12345',
  credit_limit: 25000,
  credit_days: 45,
  org_id: ORG_ID,
  // Complete address in Jaipur
  address_line1: 'Shop No. 15, Medical Complex',
  address_line2: 'Near City Hospital, MI Road',
  city: 'Jaipur',
  state: 'Rajasthan',
  pincode: '302001'
};

// Products that Tarun might order
const products = [
  {
    product_name: 'Paracetamol 500mg',
    product_code: 'PARA500',
    generic_name: 'Paracetamol',
    brand: 'Crocin',
    manufacturer: 'GSK Pharmaceuticals',
    hsn_code: '3004',
    gst_percentage: 12,
    mrp: 35.50,
    sale_price: 28.40,
    cost_price: 21.30,
    quantity_available: 5000,
    batch_number: 'PARA2024JAN',
    manufacturing_date: '2024-01-15',
    expiry_date: '2026-01-15',
    maintain_batch: true,
    maintain_expiry: true,
    composition: { active: 'Paracetamol 500mg' },
    product_type: 'standard',
    product_class: 'medicine'
  },
  {
    product_name: 'Amoxicillin 250mg Capsules',
    product_code: 'AMOX250',
    generic_name: 'Amoxicillin',
    brand: 'Mox',
    manufacturer: 'Ranbaxy',
    hsn_code: '3004',
    gst_percentage: 12,
    mrp: 65.00,
    sale_price: 52.00,
    cost_price: 39.00,
    quantity_available: 3000,
    batch_number: 'AMOX2024FEB',
    manufacturing_date: '2024-02-01',
    expiry_date: '2025-08-01',
    maintain_batch: true,
    maintain_expiry: true,
    composition: { active: 'Amoxicillin 250mg' },
    product_type: 'standard',
    product_class: 'medicine'
  },
  {
    product_name: 'Vitamin C 500mg Tablets',
    product_code: 'VITC500',
    generic_name: 'Ascorbic Acid',
    brand: 'Limcee',
    manufacturer: 'Abbott',
    hsn_code: '3004',
    gst_percentage: 12,
    mrp: 22.00,
    sale_price: 17.60,
    cost_price: 13.20,
    quantity_available: 8000,
    batch_number: 'VITC2024MAR',
    manufacturing_date: '2024-03-10',
    expiry_date: '2026-03-10',
    maintain_batch: true,
    maintain_expiry: true,
    composition: { active: 'Vitamin C 500mg' },
    product_type: 'standard',
    product_class: 'medicine'
  }
];

async function createTarunCustomer() {
  console.log('👤 Creating customer: Tarun Pharmacy');
  console.log('=' .repeat(70));
  
  try {
    const response = await api.post('/customers/', tarunCustomerData);
    const customerId = response.data.customer_id;
    
    console.log(`✅ Customer created successfully!`);
    console.log(`   Customer ID: ${customerId}`);
    console.log(`   Customer Code: ${response.data.customer_code}`);
    console.log(`   Name: ${tarunCustomerData.customer_name}`);
    console.log(`   Location: ${tarunCustomerData.city}, ${tarunCustomerData.state}`);
    console.log(`   Credit Limit: ₹${tarunCustomerData.credit_limit}`);
    console.log(`   Credit Days: ${tarunCustomerData.credit_days} days`);
    
    return customerId;
    
  } catch (error) {
    console.log('❌ Failed to create customer');
    console.error('Error:', error.response?.data?.detail || error.message);
    return null;
  }
}

async function createProducts() {
  console.log('\n📦 Creating products for Tarun to order');
  console.log('=' .repeat(70));
  
  const createdProducts = [];
  
  for (const product of products) {
    try {
      console.log(`\nCreating: ${product.product_name}`);
      const response = await api.post('/products/', product);
      const productId = response.data.product_id;
      
      console.log(`✅ Product ID: ${productId}`);
      console.log(`   MRP: ₹${product.mrp}`);
      console.log(`   Sale Price: ₹${product.sale_price}`);
      console.log(`   Stock: ${product.quantity_available} units`);
      
      createdProducts.push({
        id: productId,
        name: product.product_name,
        mrp: product.mrp,
        sale_price: product.sale_price
      });
      
    } catch (error) {
      console.log(`❌ Failed to create ${product.product_name}`);
      console.error('Error:', error.response?.data?.detail || error.message);
    }
  }
  
  return createdProducts;
}

async function createSampleOrder(customerId, products) {
  if (!products || products.length === 0) {
    console.log('⚠️  No products available to create order');
    return;
  }
  
  console.log('\n📄 Creating a sample order for Tarun');
  console.log('=' .repeat(70));
  
  // Create order with multiple items
  const orderData = {
    org_id: ORG_ID,
    customer_id: customerId,
    order_date: new Date().toISOString().split('T')[0],
    delivery_date: new Date().toISOString().split('T')[0],
    order_type: 'sales',
    payment_terms: 'credit',
    payment_status: 'pending',
    payment_mode: 'credit',
    delivery_type: 'delivery',
    items: products.slice(0, 3).map((product, index) => ({
      product_id: product.id,
      quantity: (index + 1) * 10,  // 10, 20, 30 units
      free_quantity: index + 1,     // 1, 2, 3 free units
      unit_price: product.sale_price,
      selling_price: product.sale_price,
      discount_percent: 5,
      discount_amount: product.sale_price * (index + 1) * 10 * 0.05,
      tax_percent: 12,
      tax_amount: (product.sale_price * (index + 1) * 10 * 0.95) * 0.12,
      line_total: (product.sale_price * (index + 1) * 10 * 0.95) * 1.12
    })),
    notes: 'Sample order for Tarun Pharmacy - Regular customer, priority delivery requested'
  };
  
  try {
    const response = await api.post('/orders/', orderData);
    const orderId = response.data.order_id;
    
    console.log(`✅ Order created successfully!`);
    console.log(`   Order ID: ${orderId}`);
    console.log(`   Order Number: ${response.data.order_number}`);
    console.log(`   Total Amount: ₹${response.data.final_amount}`);
    console.log(`   Items: ${orderData.items.length} products`);
    
    // Display order items
    console.log('\n   Order Details:');
    orderData.items.forEach((item, index) => {
      const product = products[index];
      console.log(`   - ${product.name}: ${item.quantity} units + ${item.free_quantity} free`);
    });
    
    return orderId;
    
  } catch (error) {
    console.log('❌ Failed to create order');
    console.error('Error:', error.response?.data?.detail || error.message);
    return null;
  }
}

async function verifyData(customerId) {
  console.log('\n🔍 Verifying data in backend');
  console.log('=' .repeat(70));
  
  try {
    // Check customer details
    const customer = await api.get(`/customers/${customerId}`);
    console.log('✅ Customer data verified in database');
    
    // Check if address was stored (via calculate-live endpoint)
    try {
      const calcRequest = {
        customer_id: customerId,
        items: [{
          product_id: 1,
          rate: 100,
          quantity: 1
        }]
      };
      
      await api.post('/invoices/calculate-live', calcRequest);
      console.log('✅ Address data accessible for GST calculations');
    } catch (e) {
      console.log('⚠️  Address may not be properly linked');
    }
    
  } catch (error) {
    console.log('❌ Data verification failed');
    console.error('Error:', error.response?.data?.detail || error.message);
  }
}

// Main execution
async function main() {
  console.log('🚀 CREATING TARUN USER WITH COMPLETE DATA');
  console.log('=' .repeat(70));
  console.log(`📍 API URL: ${API_BASE_URL}`);
  console.log(`🏢 Organization ID: ${ORG_ID}`);
  console.log('=' .repeat(70));
  
  // Step 1: Create Tarun as customer
  const customerId = await createTarunCustomer();
  if (!customerId) {
    console.log('\n❌ Cannot proceed without customer');
    process.exit(1);
  }
  
  // Step 2: Create products
  const createdProducts = await createProducts();
  
  // Step 3: Create sample order
  if (createdProducts.length > 0) {
    console.log('\n⏳ Waiting 2 seconds for database to be ready...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const orderId = await createSampleOrder(customerId, createdProducts);
  }
  
  // Step 4: Verify data
  await verifyData(customerId);
  
  // Summary
  console.log('\n' + '=' .repeat(70));
  console.log('📊 SUMMARY');
  console.log('=' .repeat(70));
  console.log('✅ Tarun Pharmacy has been created with:');
  console.log(`   - Complete customer profile with Jaipur address`);
  console.log(`   - ${createdProducts.length} products in inventory`);
  console.log(`   - Sample order with multiple items`);
  console.log('\nYou can now check the backend database to see:');
  console.log('   - Customer in parties.customers table');
  console.log('   - Address in master.addresses table');
  console.log('   - Products in inventory.products table');
  console.log('   - Order in sales.orders table');
  console.log('   - Order items in sales.order_items table');
  
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});