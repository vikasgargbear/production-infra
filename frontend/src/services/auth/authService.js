/**
 * Authentication Service
 * Manages org_id and user authentication state
 */

const AUTH_STORAGE_KEY = 'pharma_auth';
const ORG_STORAGE_KEY = 'pharma_org_id';

class AuthService {
  /**
   * Get the current organization ID
   * @returns {string|null} The organization ID or null if not set
   */
  getOrgId() {
    // First check sessionStorage (for current session)
    let orgId = sessionStorage.getItem(ORG_STORAGE_KEY);
    
    // Fall back to localStorage (for persistence)
    if (!orgId) {
      orgId = localStorage.getItem(ORG_STORAGE_KEY);
    }
    
    return orgId;
  }

  /**
   * Set the organization ID
   * @param {string} orgId - The organization ID to store
   */
  setOrgId(orgId) {
    if (orgId) {
      sessionStorage.setItem(ORG_STORAGE_KEY, orgId);
      localStorage.setItem(ORG_STORAGE_KEY, orgId);
    }
  }

  /**
   * Clear the organization ID
   */
  clearOrgId() {
    sessionStorage.removeItem(ORG_STORAGE_KEY);
    localStorage.removeItem(ORG_STORAGE_KEY);
  }

  /**
   * Store authentication data
   * @param {Object} authData - The authentication data (token, user, org)
   */
  setAuthData(authData) {
    if (authData) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authData));
      
      // Also store org_id separately for easy access
      if (authData.organization?.org_id) {
        this.setOrgId(authData.organization.org_id);
      }
    }
  }

  /**
   * Get authentication data
   * @returns {Object|null} The authentication data or null
   */
  getAuthData() {
    const data = localStorage.getItem(AUTH_STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get authentication token
   * @returns {string|null} The auth token or null
   */
  getToken() {
    const authData = this.getAuthData();
    return authData?.access_token || null;
  }

  /**
   * Check if user is authenticated
   * @returns {boolean} True if authenticated
   */
  isAuthenticated() {
    return !!this.getToken();
  }

  /**
   * Clear all authentication data
   */
  logout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    this.clearOrgId();
  }

  /**
   * Get current user info
   * @returns {Object|null} User information
   */
  getCurrentUser() {
    const authData = this.getAuthData();
    return authData?.user || null;
  }

  /**
   * Login with username/email and password
   * @param {string} username - Email or username
   * @param {string} password - Password
   * @returns {Promise<boolean>} True if login successful
   */
  async login(username, password) {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL || 'https://pharma-backend-production-0c09.up.railway.app'}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: username, // Frontend calls it username but we use email
          password: password
        })
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('Login failed:', error);
        return false;
      }

      const data = await response.json();
      
      // Store authentication data
      this.setAuthData({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type,
        expires_in: data.expires_in,
        user: data.user,
        organization: {
          org_id: data.user?.org_id,
          org_name: data.user?.org_name
        }
      });

      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }
}

// Export singleton instance
const authService = new AuthService();
export default authService;