// Run this in your browser console to test API connection

// Test 1: Basic API health check
fetch('http://localhost:8000/health')
  .then(res => res.json())
  .then(data => console.log('✅ Health check:', data))
  .catch(err => console.error('❌ Health check failed:', err));

// Test 2: Check org-users endpoint
fetch('http://localhost:8000/api/v1/org-users', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  }
})
  .then(res => {
    console.log('📡 Status:', res.status);
    return res.json();
  })
  .then(data => {
    console.log('✅ org-users response:', data);
    if (data.data && Array.isArray(data.data)) {
      console.log(`Found ${data.data.length} users`);
    }
  })
  .catch(err => console.error('❌ org-users failed:', err));

// Test 3: Check users endpoint (legacy)
fetch('http://localhost:8000/api/v1/users', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  }
})
  .then(res => {
    console.log('📡 Legacy users status:', res.status);
    return res.json();
  })
  .then(data => {
    console.log('✅ users response:', data);
    if (Array.isArray(data)) {
      console.log(`Found ${data.length} users in legacy endpoint`);
    }
  })
  .catch(err => console.error('❌ users failed:', err));