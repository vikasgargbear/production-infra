/**
 * Setup Authentication
 * Run this to ensure proper authentication is set up
 */

async function setupAuth() {
  try {
    // Login with correct credentials
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

    if (response.ok) {
      const data = await response.json();

      if (data.access_token) {
        // Store auth data in all required locations
        localStorage.setItem('authToken', data.access_token);
        localStorage.setItem('pharma_token', data.access_token);
        localStorage.setItem('auth_token', data.access_token);

        // Store user data
        if (data.user) {
          localStorage.setItem('pharma_user', JSON.stringify(data.user));

          // Store org_id in all locations
          const orgId = data.user.org_id || 'e78d6777-35f6-4b19-994f-caaede2f021a';
          localStorage.setItem('pharma_org_id', orgId);
          localStorage.setItem('org_id', orgId);
          localStorage.setItem('orgId', orgId);
          sessionStorage.setItem('pharma_org_id', orgId);
          sessionStorage.setItem('org_id', orgId);
          sessionStorage.setItem('orgId', orgId);

          // Store branch_id if available
          if (data.user.branch_id) {
            localStorage.setItem('pharma_branch_id', data.user.branch_id.toString());
          }
        }

        return true;
      }
    } else {
      // Login failed
    }
  } catch (error) {
    // Setup error
  }

  return false;
}

// Auto-run on module load
setupAuth();

export default setupAuth;