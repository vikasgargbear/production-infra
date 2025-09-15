/**
 * Enterprise Offline Authentication Service
 * Handles auth for both online and offline (exe) modes
 */

import CryptoJS from 'crypto-js';

class OfflineAuthService {
  constructor() {
    // Use a consistent app secret for offline mode
    this.APP_SECRET = process.env.REACT_APP_OFFLINE_SECRET || 'pharma-offline-2024';
    this.OFFLINE_MODE_KEY = 'offline_mode_enabled';
    this.OFFLINE_TOKEN_KEY = 'offline_auth_token';
  }

  /**
   * Check if app is running in offline/exe mode
   */
  isOfflineMode() {
    // Check for actual offline conditions
    return (
      window.navigator.onLine === false ||
      localStorage.getItem(this.OFFLINE_MODE_KEY) === 'true' ||
      window.location.protocol === 'file:' ||
      window.electron !== undefined
    );
  }

  /**
   * Generate a secure offline token for the user
   */
  generateOfflineToken(userData) {
    const payload = {
      ...userData,
      offline: true,
      created: Date.now(),
      expires: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
    };

    // Encrypt the payload for security
    const encrypted = CryptoJS.AES.encrypt(
      JSON.stringify(payload),
      this.APP_SECRET
    ).toString();

    return encrypted;
  }

  /**
   * Validate offline token
   */
  validateOfflineToken(token) {
    try {
      const decrypted = CryptoJS.AES.decrypt(token, this.APP_SECRET);
      const payload = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));

      // Check expiry
      if (payload.expires && payload.expires < Date.now()) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  /**
   * Setup offline user (first-time setup for exe)
   */
  setupOfflineUser(companyData) {
    const userData = {
      user_id: 1,
      email: companyData.email || 'admin@local',
      org_id: 1,
      organization_id: 1,
      branch_id: 1,
      role: 'admin',
      company_name: companyData.company_name,
      permissions: ['all']
    };

    const token = this.generateOfflineToken(userData);
    localStorage.setItem(this.OFFLINE_TOKEN_KEY, token);
    localStorage.setItem('pharma_org_id', '1');
    localStorage.setItem(this.OFFLINE_MODE_KEY, 'true');

    return token;
  }

  /**
   * Get current auth token (works for both online and offline)
   */
  getAuthToken() {
    if (this.isOfflineMode()) {
      return localStorage.getItem(this.OFFLINE_TOKEN_KEY);
    }
    return localStorage.getItem('authToken');
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    const token = this.getAuthToken();
    if (!token) return false;

    if (this.isOfflineMode()) {
      return this.validateOfflineToken(token) !== null;
    }

    // For online mode, validate JWT
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      
      const payload = JSON.parse(atob(parts[1]));
      const now = Date.now() / 1000;
      
      return !(payload.exp && payload.exp < now);
    } catch {
      return false;
    }
  }

  /**
   * Login function that works both online and offline
   */
  async login(credentials) {
    if (this.isOfflineMode()) {
      // Offline login - validate against stored credentials
      const storedCreds = localStorage.getItem('offline_credentials');
      if (storedCreds) {
        const decrypted = CryptoJS.AES.decrypt(storedCreds, this.APP_SECRET);
        const stored = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
        
        if (stored.email === credentials.email && 
            stored.password === CryptoJS.SHA256(credentials.password).toString()) {
          // Generate new offline token
          const token = this.generateOfflineToken({
            user_id: 1,
            email: credentials.email,
            org_id: 1,
            organization_id: 1,
            branch_id: 1,
            role: 'admin',
            permissions: ['all']
          });
          
          localStorage.setItem(this.OFFLINE_TOKEN_KEY, token);
          return { success: true, token };
        }
      }
      
      // First time offline login - set up credentials
      const hashedPassword = CryptoJS.SHA256(credentials.password).toString();
      const credsToStore = {
        email: credentials.email,
        password: hashedPassword
      };
      
      const encrypted = CryptoJS.AES.encrypt(
        JSON.stringify(credsToStore),
        this.APP_SECRET
      ).toString();
      
      localStorage.setItem('offline_credentials', encrypted);
      
      // Generate token
      const token = this.generateOfflineToken({
        user_id: 1,
        email: credentials.email,
        org_id: 1,
        organization_id: 1,
        branch_id: 1,
        role: 'admin',
        permissions: ['all']
      });
      
      localStorage.setItem(this.OFFLINE_TOKEN_KEY, token);
      return { success: true, token };
    }

    // Online login - call backend API
    try {
      const response = await fetch(`${process.env.REACT_APP_API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('authToken', data.access_token);
        localStorage.setItem('pharma_org_id', data.org_id || '1');
        return { success: true, token: data.access_token };
      }

      return { success: false, error: 'Invalid credentials' };
    } catch (error) {
      // If online login fails, offer offline mode
      if (!window.navigator.onLine) {
        console.log('No internet connection, switching to offline mode');
        localStorage.setItem(this.OFFLINE_MODE_KEY, 'true');
        return this.login(credentials); // Retry in offline mode
      }
      
      return { success: false, error: error.message };
    }
  }

  /**
   * Logout
   */
  logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem(this.OFFLINE_TOKEN_KEY);
    localStorage.removeItem('pharma_org_id');
    // Don't remove offline_credentials - keep for future offline logins
  }
}

export default new OfflineAuthService();