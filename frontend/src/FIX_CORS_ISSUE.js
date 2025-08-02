// TEMPORARY FIX: Test direct HTTP endpoint
// Run this in your browser console

// Test 1: Try direct HTTP (no redirect)
const testDirectHTTP = async () => {
  try {
    const response = await fetch('http://pharma-backend-production-0c09.up.railway.app/api/v1/org-users', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    const data = await response.json();
    console.log('✅ Direct HTTP worked:', data);
  } catch (error) {
    console.error('❌ Direct HTTP failed:', error);
  }
};

// Test 2: Check if backend is healthy
const testHealth = async () => {
  try {
    // Try HTTPS
    const httpsResp = await fetch('https://pharma-backend-production-0c09.up.railway.app/health');
    console.log('HTTPS health:', httpsResp.status);
    
    // Try HTTP
    const httpResp = await fetch('http://pharma-backend-production-0c09.up.railway.app/health');
    console.log('HTTP health:', httpResp.status);
  } catch (error) {
    console.error('Health check error:', error);
  }
};

// Run tests
console.log('Testing backend connectivity...');
testHealth();
testDirectHTTP();