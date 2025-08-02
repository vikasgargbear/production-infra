// Test User Management CRUD Operations
// Run these in your browser console while on User Management page

// TEST 1: CREATE USER
async function testCreateUser() {
  console.log('🧪 TEST 1: Creating new user...');
  
  const testUser = {
    org_id: 'ad808530-1ddb-4377-ab20-67bef145d80d', // Your org ID
    full_name: 'Test CRUD User',
    email: 'testcrud@pharmacy.com',
    role: 'billing',
    password: 'Test123!'
  };
  
  try {
    const response = await fetch('https://pharma-backend-production-0c09.up.railway.app/api/v1/org-users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testUser)
    });
    
    const result = await response.json();
    console.log('✅ Create Result:', result);
    return result;
  } catch (error) {
    console.error('❌ Create Failed:', error);
  }
}

// TEST 2: READ USERS
async function testReadUsers() {
  console.log('🧪 TEST 2: Reading users...');
  
  try {
    const response = await fetch('https://pharma-backend-production-0c09.up.railway.app/api/v1/org-users');
    const result = await response.json();
    console.log('✅ Read Result:', result.data?.length + ' users found');
    return result;
  } catch (error) {
    console.error('❌ Read Failed:', error);
  }
}

// TEST 3: UPDATE USER
async function testUpdateUser(userId) {
  console.log('🧪 TEST 3: Updating user...');
  
  const updates = {
    full_name: 'Updated Test User',
    role: 'manager'
  };
  
  try {
    const response = await fetch(`https://pharma-backend-production-0c09.up.railway.app/api/v1/org-users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates)
    });
    
    const result = await response.json();
    console.log('✅ Update Result:', result);
    return result;
  } catch (error) {
    console.error('❌ Update Failed:', error);
  }
}

// TEST 4: DELETE USER
async function testDeleteUser(userId) {
  console.log('🧪 TEST 4: Deleting user...');
  
  try {
    const response = await fetch(`https://pharma-backend-production-0c09.up.railway.app/api/v1/org-users/${userId}`, {
      method: 'DELETE'
    });
    
    const result = await response.json();
    console.log('✅ Delete Result:', result);
    return result;
  } catch (error) {
    console.error('❌ Delete Failed:', error);
  }
}

// RUN ALL TESTS
async function runAllTests() {
  console.log('🚀 Starting CRUD Tests...\n');
  
  // Test 1: Read existing users
  await testReadUsers();
  
  // Test 2: Create a new user
  const createResult = await testCreateUser();
  
  if (createResult && createResult.user_id) {
    const userId = createResult.user_id;
    
    // Test 3: Update the user
    await testUpdateUser(userId);
    
    // Test 4: Delete the user
    await testDeleteUser(userId);
  }
  
  // Test 5: Read again to confirm
  await testReadUsers();
  
  console.log('\n✅ All tests completed!');
}

// To run all tests, call:
// runAllTests();

console.log('Test functions loaded. Run: runAllTests()');