/**
 * Setup Authentication - Extract org_id from JWT before anything else
 * This runs FIRST before OrgIdManager initializes
 */

// Check if there's a JWT token and extract org_id IMMEDIATELY
const token = localStorage.getItem('authToken') || 
              localStorage.getItem('pharma_token') || 
              localStorage.getItem('auth_token');

if (token) {
  try {
    // Decode JWT to get org_id
    const actualToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    const parts = actualToken.split('.');
    
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      
      // Check if token is valid (not expired)
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp > now) {
        // Extract and store org_id BEFORE OrgIdManager runs
        if (payload.org_id) {
          localStorage.setItem('pharma_org_id', payload.org_id);
          localStorage.setItem('org_id', payload.org_id);
        }
        
        // Store user data
        const userData = {
          user_id: payload.user_id,
          email: payload.email,
          org_id: payload.org_id,
          role_id: payload.role_id,
          branch_id: payload.branch_id
        };
        localStorage.setItem('pharma_user', JSON.stringify(userData));
        
        if (payload.branch_id) {
          localStorage.setItem('pharma_branch_id', payload.branch_id);
        }
      } else {
        // Token expired - clear everything
        localStorage.removeItem('authToken');
        localStorage.removeItem('pharma_token');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('pharma_user');
        localStorage.removeItem('pharma_org_id');
        localStorage.removeItem('org_id');
      }
    }
  } catch (error) {
    console.error('Failed to extract org_id from token:', error);
  }
}

export default {};