import { getApiBaseUrl } from './config/apiBase';
import orgIdManager from './services/OrgIdManager';

/**
 * Setup Authentication
 * Run this to ensure proper authentication is set up
 */

async function setupAuth() {
  try {
    // Login with correct credentials
    const loginUrl = `${getApiBaseUrl()}/api/auth/login`;
    const headers = {
      'Content-Type': 'application/json'
    };

    const orgIdHeader = orgIdManager.getOrgId();
    if (orgIdHeader) {
      headers['X-Org-Id'] = orgIdHeader;
    }

    const email = process.env.REACT_APP_SETUP_AUTH_EMAIL ||
                  process.env.REACT_APP_AUTO_LOGIN_EMAIL ||
                  'admin@pharma.com';
    const password = process.env.REACT_APP_SETUP_AUTH_PASSWORD ||
                     process.env.REACT_APP_AUTO_LOGIN_PASSWORD ||
                     'admin123';

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        password
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
          const orgId = data.user.org_id || orgIdManager.getOrgId();
          if (orgId) {
            orgIdManager.setOrgId(orgId);
          }

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