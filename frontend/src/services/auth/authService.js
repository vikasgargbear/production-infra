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
}

// Export singleton instance
const authService = new AuthService();
export default authService;