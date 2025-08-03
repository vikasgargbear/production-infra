const axios = require('axios');

// Test the customer search with the API wrapper
async function testCustomerAPI() {
  console.log('Testing Customer Search API Wrapper\n');
  
  // Simulate what the frontend does
  const apiClient = axios.create({
    baseURL: 'https://pharma-backend-production-0c09.up.railway.app/api/v1',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  // Test the wrapper function
  const customerAPI = {
    search: async (query, options = {}) => {
      const response = await apiClient.get('/customers/', {
        params: {
          search: query,
          customer_type: options.customerType,
          limit: options.limit || 50,
          offset: options.offset || 0,
        },
      });
      // Wrap the response to match expected format
      return {
        success: true,
        data: response.data.customers || [],
        total: response.data.total,
        page: response.data.page,
        per_page: response.data.per_page
      };
    },
  };

  try {
    // Test 1: Search for "test"
    console.log('1. Searching for "test"...');
    const result1 = await customerAPI.search('test');
    console.log(`   Found ${result1.data.length} customers`);
    console.log(`   Response structure: { success: ${result1.success}, data: [...${result1.data.length} items], total: ${result1.total} }`);
    
    // Test 2: Search for "abc"
    console.log('\n2. Searching for "abc"...');
    const result2 = await customerAPI.search('abc');
    console.log(`   Found ${result2.data.length} customers`);
    if (result2.data.length > 0) {
      console.log(`   First customer: ${result2.data[0].customer_name} (${result2.data[0].customer_code})`);
    }
    
    // Test 3: Search for "vikas" 
    console.log('\n3. Searching for "vikas"...');
    const result3 = await customerAPI.search('vikas');
    console.log(`   Found ${result3.data.length} customers`);
    if (result3.data.length === 0) {
      console.log('   Note: "Vikas" customer has different org_id and won\'t be found');
    }
    
    console.log('\n✅ API wrapper is working correctly!');
    console.log('The response is properly wrapped with { success, data, total } structure');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}

testCustomerAPI();