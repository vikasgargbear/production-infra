// Test authentication script
// Run this in browser console to test auth

async function testAuth() {
  console.log('🧪 Testing Authentication System...\n');

  // Check current auth status
  const token = localStorage.getItem('authToken');
  const user = localStorage.getItem('pharma_user');
  const orgId = localStorage.getItem('pharma_org_id');

  console.log('📦 Current Storage:');
  console.log('Token:', token ? `${token.substring(0, 50)}...` : 'None');
  console.log('User:', user ? JSON.parse(user) : 'None');
  console.log('Org ID:', orgId || 'None');
  console.log('');

  // Test login
  console.log('🔐 Testing Login...');
  try {
    const response = await fetch('https://pharma-backend-production-0c09.up.railway.app/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Org-Id': 'e78d6777-35f6-4b19-994f-caaede2f021a'
      },
      body: JSON.stringify({
        email: 'admin@pharma.com',
        password: 'admin123'
      })
    });

    const data = await response.json();

    if (data.access_token) {
      console.log('✅ Login successful!');
      console.log('Token:', data.access_token.substring(0, 50) + '...');
      console.log('User:', data.user);

      // Store auth data
      localStorage.setItem('authToken', data.access_token);
      localStorage.setItem('pharma_token', data.access_token);
      localStorage.setItem('pharma_user', JSON.stringify(data.user));
      localStorage.setItem('pharma_org_id', data.user.org_id);

      console.log('\n✅ Authentication stored successfully!');
      console.log('You should now be able to use the app without auth errors.');

      return true;
    } else {
      console.error('❌ Login failed:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ Login error:', error);
    return false;
  }
}

// Test purchase API with auth
async function testPurchaseAPI() {
  const token = localStorage.getItem('authToken');
  const orgId = localStorage.getItem('pharma_org_id');

  if (!token) {
    console.error('❌ No auth token found. Run testAuth() first.');
    return;
  }

  console.log('🧪 Testing Purchase API...');

  try {
    const response = await fetch('https://pharma-backend-production-0c09.up.railway.app/api/purchase-enhanced/with-items', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Org-Id': orgId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        supplier_id: 1,
        invoice_no: 'TEST-' + Date.now(),
        invoice_date: new Date().toISOString().split('T')[0],
        payment_mode: 'cash',
        branch_id: 5,
        items: []
      })
    });

    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);

    if (response.ok) {
      console.log('✅ Purchase API working!');
    } else {
      console.error('❌ Purchase API error:', data);
    }
  } catch (error) {
    console.error('❌ Purchase API error:', error);
  }
}

// Auto-run
console.log('Run testAuth() to test authentication');
console.log('Run testPurchaseAPI() to test purchase endpoint');

// Export for manual use
window.testAuth = testAuth;
window.testPurchaseAPI = testPurchaseAPI;