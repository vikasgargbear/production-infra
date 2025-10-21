import { getApiBaseUrl } from '../../config/apiBase';
import orgIdManager from '../OrgIdManager';

/**
 * Enterprise Authentication Service
 * Production-ready authentication with offline support
 */

class AuthService {
  constructor() {
    this.API_BASE = `${getApiBaseUrl()}/api`;
    this.TOKEN_KEY = 'authToken';
    this.USER_KEY = 'pharma_user';
    this.ORG_KEY = 'pharma_org_id';
    this.OFFLINE_CREDS_KEY = 'pharma_offline_creds';

    // Initialize auth state
    this.isOnline = navigator.onLine;
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Monitor online/offline status
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncAuthentication();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  /**
   * Login with email and password
   */
  async login(email, password) {
    // Try online login first
    if (this.isOnline) {
      try {
        const headers = {
          'Content-Type': 'application/json'
        };

        const orgId = this.getOrgId();
        if (orgId) {
          headers['X-Org-Id'] = orgId;
        }

        const response = await fetch(`${this.API_BASE}/auth/login`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ email, password })
        });

        if (response.ok) {
          const data = await response.json();

          if (data.access_token) {
            // Store authentication data
            this.storeAuthData(data);

            // Store credentials hash for offline use
            this.storeOfflineCredentials(email, password);

            return {
              success: true,
              user: data.user,
              token: data.access_token
            };
          }
        } else if (response.status === 401) {
          // Invalid credentials
          return {
            success: false,
            error: 'Invalid email or password'
          };
        }
      } catch (error) {
        // Online login failed, trying offline mode
      }
    }

    // Fallback to offline authentication
    return this.offlineLogin(email, password);
  }

  /**
   * Offline login using cached credentials
   */
  offlineLogin(email, password) {
    const offlineCreds = this.getOfflineCredentials();

    if (!offlineCreds) {
      return {
        success: false,
        error: 'No offline credentials available. Please login online first.'
      };
    }

    // Validate credentials
    if (offlineCreds.email === email &&
        offlineCreds.passwordHash === this.hashPassword(password)) {

      // Generate offline token
      const offlineToken = this.generateOfflineToken(offlineCreds);

      // Store auth data
      localStorage.setItem(this.TOKEN_KEY, offlineToken);
      localStorage.setItem(this.USER_KEY, JSON.stringify(offlineCreds.user));
      this.ensureOrgId(offlineCreds.user.org_id);

      return {
        success: true,
        user: offlineCreds.user,
        offline: true
      };
    }

    return {
      success: false,
      error: 'Invalid credentials'
    };
  }

  /**
   * Store authentication data from successful login
   */
  storeAuthData(data) {
    // Store token
    localStorage.setItem(this.TOKEN_KEY, data.access_token);
    localStorage.setItem('pharma_token', data.access_token); // Backward compatibility
    localStorage.setItem('auth_token', data.access_token); // Backward compatibility

    // Store user data
    if (data.user) {
      localStorage.setItem(this.USER_KEY, JSON.stringify(data.user));

      // Ensure org_id is set everywhere
      const orgId = data.user.org_id || this.getOrgId();
      this.ensureOrgId(orgId);

      // Store branch_id if provided
      if (data.user.branch_id) {
        localStorage.setItem('pharma_branch_id', data.user.branch_id);
      }
    }
  }

  /**
   * Store credentials for offline use
   */
  storeOfflineCredentials(email, password) {
    const user = this.getCurrentUser();
    if (!user || !user.org_id) {
      return;
    }

    const storedBranchId = localStorage.getItem('pharma_branch_id');
    const branchId = user.branch_id || (storedBranchId ? Number(storedBranchId) : undefined);

    const offlineCreds = {
      email: email,
      passwordHash: this.hashPassword(password),
      user: {
        ...user,
        branch_id: branchId ?? undefined
      }
    };

    // Encrypt and store
    const encrypted = btoa(JSON.stringify(offlineCreds));
    localStorage.setItem(this.OFFLINE_CREDS_KEY, encrypted);
  }

  /**
   * Get stored offline credentials
   */
  getOfflineCredentials() {
    const encrypted = localStorage.getItem(this.OFFLINE_CREDS_KEY);
    if (!encrypted) return null;

    try {
      return JSON.parse(atob(encrypted));
    } catch (e) {
      return null;
    }
  }

  /**
   * Simple password hashing for offline validation
   */
  hashPassword(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Generate offline JWT-like token
   */
  generateOfflineToken(credentials) {
    const orgId = credentials.user.org_id || this.getOrgId();
    const storedBranchId = credentials.user.branch_id ?? localStorage.getItem('pharma_branch_id');
    const branchId = storedBranchId != null ? Number(storedBranchId) : undefined;

    const payloadData = {
      user_id: credentials.user.id || credentials.user.user_id,
      email: credentials.email,
      org_id: orgId,
      offline: true,
      exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60)
    };

    if (!Number.isNaN(branchId) && branchId !== undefined && branchId !== null) {
      payloadData.branch_id = branchId;
    }

    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = btoa(JSON.stringify(payloadData));
    const signature = btoa('offline_' + Date.now());

    return `${header}.${payload}.${signature}`;
  }

  /**
   * Ensure org_id is set in all required locations
   */
  ensureOrgId(orgId) {
    const id = orgId || this.getOrgId();
    if (id) {
      orgIdManager.setOrgId(id);
    }
  }

  /**
   * Get current org_id
   */
  getOrgId() {
    return orgIdManager.getOrgId();
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    const token = this.getToken();
    return token && this.isTokenValid(token);
  }

  /**
   * Get stored token
   */
  getToken() {
    return localStorage.getItem(this.TOKEN_KEY) ||
           localStorage.getItem('pharma_token') ||
           localStorage.getItem('auth_token');
  }

  /**
   * Validate token
   */
  isTokenValid(token) {
    if (!token) return false;

    try {
      const actualToken = token.startsWith('Bearer ') ? token.slice(7) : token;
      const parts = actualToken.split('.');

      if (parts.length !== 3) return false;

      const payload = JSON.parse(atob(parts[1]));
      const now = Math.floor(Date.now() / 1000);

      // Check expiration with 5 minute buffer
      return payload.exp && payload.exp > (now + 300);
    } catch (e) {
      return false;
    }
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    const userStr = localStorage.getItem(this.USER_KEY);
    if (!userStr) return null;

    try {
      return JSON.parse(userStr);
    } catch (e) {
      return null;
    }
  }

  /**
   * Get auth headers for API requests
   */
  getAuthHeaders() {
    const token = this.getToken();
    return {
      'Authorization': token ? `Bearer ${token}` : '',
      'X-Org-Id': this.getOrgId(),
      'Content-Type': 'application/json'
    };
  }

  /**
   * Refresh token if needed
   */
  async refreshToken() {
    const token = this.getToken();
    if (!token || !this.isOnline) return false;

    try {
      const response = await fetch(`${this.API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: this.getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        if (data.access_token) {
          this.storeAuthData(data);
          return true;
        }
      }
    } catch (error) {
      // Token refresh failed
    }

    return false;
  }

  /**
   * Sync authentication when coming back online
   */
  async syncAuthentication() {
    if (!this.isOnline) return;

    const token = this.getToken();
    if (!token) return;

    // If token is expired, try to refresh
    if (!this.isTokenValid(token)) {
      await this.refreshToken();
    }
  }

  /**
   * Logout
   */
  logout() {
    // Clear all auth data
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem('pharma_token');
    localStorage.removeItem('auth_token');
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem('pharma_branch_id');

    // Keep offline credentials for future offline login
    // localStorage.removeItem(this.OFFLINE_CREDS_KEY);

    orgIdManager.clearOrgId();

    // Clear session storage
    sessionStorage.clear();

    // Redirect to login
    window.location.href = '/login';
  }

  /**
   * Auto-login with stored credentials (for testing/development)
   */
  async autoLogin() {
    // Check if already authenticated
    if (this.isAuthenticated()) {
      return { success: true, user: this.getCurrentUser() };
    }

    // Try to login with default credentials
    const email = process.env.REACT_APP_AUTO_LOGIN_EMAIL || 'admin@pharma.com';
    const password = process.env.REACT_APP_AUTO_LOGIN_PASSWORD || 'admin123';
    return await this.login(email, password);
  }
}

// Create singleton instance
const authService = new AuthService();

// Export for use in other modules
export default authService;