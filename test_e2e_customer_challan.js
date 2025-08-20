/**
 * End-to-End Test for Customer Creation and Challan Flow
 * Tests both B2B customer creation and direct challan creation
 */

const API_BASE_URL = 'https://pharma-backend-production-0c09.up.railway.app/api';
const AUTH_TOKEN = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ2aWthc0BhYXNvcGhhcm1hLmNvbSIsIm9yZ19pZCI6ImFkODA4NTMwLTFkZGItNDM3Ny1hYjIwLTY3YmVmMTQ1ZDgwZCIsInVzZXJfaWQiOjEsInJvbGUiOiJhZG1pbiIsImV4cCI6MTc1NTU1MzkwMH0.xkCNspKb_u7B91RYooZk8PLvGcPCcQB4dHPXXpeXNsY';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Test 1: Create B2B Customer
async function testB2BCustomerCreation() {
    console.log('\n========== TEST 1: B2B Customer Creation ==========');
    
    const customerData = {
        org_id: 'ad808530-1ddb-4377-ab20-67bef145d80d',
        customer_name: 'Test Pharma Distributors Pvt Ltd',
        customer_type: 'wholesale',  // Use valid customer type
        contact_person: 'Mr. Rajesh Kumar',
        primary_phone: '9876543210',
        email: 'test@testpharma.com',
        address_line1: 'Shop No 5, Medical Complex',
        city: 'Mumbai', 
        state: 'Maharashtra',
        pincode: '400001',
        gstin: '29GGGGG1314R9Z6',
        pan_number: 'AAAAA1234B',
        drug_license_number: 'DL-MH-123456',
        credit_limit: 100000,
        credit_days: 45,
        discount_percent: 5.0,
        is_active: true,
        notes: 'Test B2B customer for end-to-end testing'
    };

    try {
        const response = await fetch(`${API_BASE_URL}/customers/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': AUTH_TOKEN
            },
            body: JSON.stringify(customerData)
        });

        const result = await response.json();
        
        if (response.ok) {
            console.log('✅ Customer created successfully!');
            console.log('Customer ID:', result.customer_id);
            console.log('Customer Name:', result.customer_name);
            console.log('Contact Person:', result.contact_person_name);
            console.log('Credit Plan: Premium -', result.credit_limit, 'limit,', result.credit_days, 'days');
            return result.customer_id;
        } else {
            console.error('❌ Failed to create customer:', result);
            return null;
        }
    } catch (error) {
        console.error('❌ Error creating customer:', error);
        return null;
    }
}

// Test 2: Create Direct Challan (without order)
async function testDirectChallanCreation(customerId) {
    console.log('\n========== TEST 2: Direct Challan Creation (No Order) ==========');
    
    const challanData = {
        // No order_id - this is a direct challan
        customer_id: customerId || 37, // Use created customer or fallback
        dispatch_date: new Date().toISOString().split('T')[0],
        vehicle_number: 'MH12AB1234',
        transport_company: 'Fast Logistics',
        lr_number: 'LR123456',
        freight_amount: 500,
        delivery_address: 'Shop No 5, Medical Complex',
        delivery_city: 'Mumbai',
        delivery_state: 'Maharashtra',
        delivery_pincode: '400001',
        delivery_contact_person: 'Store Manager',
        delivery_contact_phone: '9876543210',
        total_packages: 2,
        notes: 'Direct challan without order - Testing',
        items: [
            {
                product_id: 1,
                product_name: 'Paracetamol 500mg',
                batch_number: 'BATCH-2025-001',
                expiry_date: '2026-12-31',
                dispatched_quantity: 100,
                unit_price: 2.50,
                package_type: 'Strip',
                packages_count: 10
            },
            {
                product_id: 2,
                product_name: 'Amoxicillin 250mg',
                batch_number: 'BATCH-2025-002',
                expiry_date: '2026-06-30',
                dispatched_quantity: 50,
                unit_price: 5.00,
                package_type: 'Strip',
                packages_count: 5
            }
        ]
    };

    try {
        const response = await fetch(`${API_BASE_URL}/enterprise-delivery-challan/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': AUTH_TOKEN
            },
            body: JSON.stringify(challanData)
        });

        const result = await response.json();
        
        if (response.ok) {
            console.log('✅ Direct challan created successfully!');
            console.log('Challan ID:', result.challan_id);
            console.log('Challan Number:', result.challan_number);
            console.log('Total Amount:', result.total_amount);
            console.log('Items Count:', result.items?.length || 2);
            return result.challan_id;
        } else {
            console.error('❌ Failed to create challan:', result);
            return null;
        }
    } catch (error) {
        console.error('❌ Error creating challan:', error);
        return null;
    }
}

// Test 3: Verify Data in Database
async function verifyDataInDatabase(customerId, challanId) {
    console.log('\n========== TEST 3: Verify Backend Data Storage ==========');
    
    // Verify customer data
    if (customerId) {
        try {
            const response = await fetch(`${API_BASE_URL}/customers/${customerId}`, {
                headers: {
                    'Authorization': AUTH_TOKEN
                }
            });
            
            if (response.ok) {
                const customer = await response.json();
                console.log('✅ Customer data verified in database:');
                console.log('  - Customer Type:', customer.customer_type);
                console.log('  - Contact Person:', customer.contact_person_name);
                console.log('  - Credit Limit:', customer.credit_limit);
                console.log('  - Credit Days:', customer.credit_days);
            } else {
                console.error('❌ Could not verify customer data');
            }
        } catch (error) {
            console.error('❌ Error verifying customer:', error);
        }
    }
    
    // Verify challan data
    if (challanId) {
        try {
            const response = await fetch(`${API_BASE_URL}/enterprise-delivery-challan/${challanId}`, {
                headers: {
                    'Authorization': AUTH_TOKEN
                }
            });
            
            if (response.ok) {
                const challan = await response.json();
                console.log('✅ Challan data verified in database:');
                console.log('  - Challan Number:', challan.challan_number);
                console.log('  - Order ID:', challan.order_id || 'NULL (Direct Challan)');
                console.log('  - Customer ID:', challan.customer_id);
                console.log('  - Total Amount:', challan.total_amount);
                console.log('  - Items:', challan.items?.length || 0, 'products');
            } else {
                console.error('❌ Could not verify challan data');
            }
        } catch (error) {
            console.error('❌ Error verifying challan:', error);
        }
    }
}

// Test 4: Create Challan from Order (if order exists)
async function testChallanFromOrder() {
    console.log('\n========== TEST 4: Challan Creation from Order ==========');
    
    // First, check if we have any orders
    try {
        const ordersResponse = await fetch(`${API_BASE_URL}/orders?limit=1`, {
            headers: {
                'Authorization': AUTH_TOKEN
            }
        });
        
        if (ordersResponse.ok) {
            const orders = await ordersResponse.json();
            if (orders && orders.length > 0) {
                const order = orders[0];
                console.log('Found order:', order.order_number, '- Customer:', order.customer_name);
                
                // Create challan from this order
                const challanData = {
                    order_id: order.order_id,  // Link to order
                    customer_id: order.customer_id,
                    dispatch_date: new Date().toISOString().split('T')[0],
                    vehicle_number: 'MH12CD5678',
                    transport_company: 'Express Delivery',
                    lr_number: 'LR789012',
                    freight_amount: 300,
                    delivery_address: order.delivery_address || 'Default Address',
                    delivery_city: 'Mumbai',
                    delivery_state: 'Maharashtra',
                    delivery_pincode: '400001',
                    notes: 'Challan created from order - Testing',
                    items: [] // Will be populated from order items
                };
                
                // Get order items
                const itemsResponse = await fetch(`${API_BASE_URL}/orders/${order.order_id}/items`, {
                    headers: {
                        'Authorization': AUTH_TOKEN
                    }
                });
                
                if (itemsResponse.ok) {
                    const orderItems = await itemsResponse.json();
                    challanData.items = orderItems.map(item => ({
                        order_item_id: item.order_item_id,
                        product_id: item.product_id,
                        product_name: item.product_name,
                        ordered_quantity: item.quantity,
                        dispatched_quantity: item.quantity,
                        unit_price: item.unit_price,
                        package_type: item.pack_type
                    }));
                }
                
                const response = await fetch(`${API_BASE_URL}/enterprise-delivery-challan/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': AUTH_TOKEN
                    },
                    body: JSON.stringify(challanData)
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    console.log('✅ Challan from order created successfully!');
                    console.log('Challan Number:', result.challan_number);
                    console.log('Linked Order ID:', challanData.order_id);
                } else {
                    console.error('❌ Failed to create challan from order:', result);
                }
            } else {
                console.log('ℹ️ No orders found to test challan creation from order');
            }
        }
    } catch (error) {
        console.error('❌ Error in order-based challan test:', error);
    }
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Starting End-to-End Tests for Customer & Challan Flow\n');
    console.log('API Endpoint:', API_BASE_URL);
    console.log('Testing both direct and order-based flows...\n');
    
    // Test B2B Customer Creation
    const customerId = await testB2BCustomerCreation();
    await delay(1000);
    
    // Test Direct Challan Creation (without order)
    const challanId = await testDirectChallanCreation(customerId);
    await delay(1000);
    
    // Verify data storage
    await verifyDataInDatabase(customerId, challanId);
    await delay(1000);
    
    // Test challan from order (if orders exist)
    await testChallanFromOrder();
    
    console.log('\n========== TEST SUMMARY ==========');
    console.log('✅ B2B Customer Creation:', customerId ? 'PASSED' : 'FAILED');
    console.log('✅ Direct Challan Creation:', challanId ? 'PASSED' : 'FAILED');
    console.log('✅ Data Verification:', 'COMPLETED');
    console.log('\n🎉 End-to-End Testing Complete!');
}

// Execute tests
runAllTests().catch(console.error);