// Authentication service for JWT-based authentication
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL ? `${process.env.REACT_APP_API_BASE_URL}/api` : (process.env.REACT_APP_API_URL || 'http://localhost:8000/api');

class AuthService {
  constructor() {
    this.token = localStorage.getItem('authToken');
    this.refreshToken = localStorage.getItem('refreshToken');
    this.user = JSON.parse(localStorage.getItem('user') || '{}');
  }

  // Login method
  async login(username, password) {
    // Demo users for testing
    const demoUsers = [
      { username: 'admin', password: 'admin123', role: 'Admin' },
      { username: 'sales', password: 'sales123', role: 'Sales' },
      { username: 'accounts', password: 'accounts123', role: 'Accounts' },
      { username: 'warehouse', password: 'warehouse123', role: 'Warehouse' }
    ];

    // Check for demo login first
    const demoUser = demoUsers.find(u => u.username === username && u.password === password);
    if (demoUser) {
      // Create a fake token for demo
      const demoToken = `demo_token_${Date.now()}`;
      const demoUserData = {
        id: Math.random().toString(36).substr(2, 9),
        username: demoUser.username,
        role: demoUser.role,
        email: `${demoUser.username}@demo.com`
      };

      // Store tokens and user data
      this.token = demoToken;
      this.user = demoUserData;

      localStorage.setItem('authToken', demoToken);
      localStorage.setItem('token', demoToken); // Also store as 'token' for compatibility
      localStorage.setItem('user', JSON.stringify(demoUserData));

      // Set default authorization header
      this.setAuthHeader(demoToken);

      return { success: true, user: demoUserData };
    }

    // If not demo user, try actual API
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/login`, {
        username,
        password
      });

      const { access_token, refresh_token, user } = response.data;

      // Store tokens and user data
      this.token = access_token;
      this.refreshToken = refresh_token;
      this.user = user;

      localStorage.setItem('authToken', access_token);
      localStorage.setItem('token', access_token); // Also store as 'token' for compatibility
      localStorage.setItem('refreshToken', refresh_token);
      localStorage.setItem('user', JSON.stringify(user));

      // Set default authorization header
      this.setAuthHeader(access_token);

      return { success: true, user };
    } catch (error) {
      console.error('Login error:', error);
      return { 
        success: false, 
        error: error.response?.data?.message || 'Login failed. Please check your credentials.' 
      };
    }
  }

  // Logout method
  logout() {
    this.token = null;
    this.refreshToken = null;
    this.user = {};
    
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    
    // Remove authorization header
    delete axios.defaults.headers.common['Authorization'];
    
    // Redirect to login
    window.location.href = '/login';
  }

  // Refresh token method
  async refreshAccessToken() {
    try {
      const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
        refresh_token: this.refreshToken
      });

      const { access_token } = response.data;
      
      this.token = access_token;
      localStorage.setItem('authToken', access_token);
      this.setAuthHeader(access_token);

      return access_token;
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.logout();
      return null;
    }
  }

  // Set authorization header
  setAuthHeader(token) {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.token;
  }

  // Get current user
  getCurrentUser() {
    return this.user;
  }

  // Get user role
  getUserRole() {
    return this.user?.role || 'guest';
  }

  // Check if user has permission
  hasPermission(permission) {
    const rolePermissions = {
      admin: ['all'],
      manager: ['view_all', 'edit_all', 'create_orders', 'manage_inventory'],
      sales: ['view_products', 'create_orders', 'view_customers'],
      accounts: ['view_payments', 'manage_payments', 'view_reports'],
      warehouse: ['manage_inventory', 'view_products']
    };

    const userRole = this.getUserRole();
    const permissions = rolePermissions[userRole] || [];
    
    return permissions.includes('all') || permissions.includes(permission);
  }

  // Initialize auth (call on app start)
  init() {
    if (this.token) {
      this.setAuthHeader(this.token);
      
      // Set up request interceptor for token refresh
      axios.interceptors.request.use(
        (config) => {
          // Add auth header if not present
          if (this.token && !config.headers.Authorization) {
            config.headers.Authorization = `Bearer ${this.token}`;
          }
          return config;
        },
        (error) => Promise.reject(error)
      );

      // Set up response interceptor for 401 errors
      axios.interceptors.response.use(
        (response) => response,
        async (error) => {
          const originalRequest = error.config;

          if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            const newToken = await this.refreshAccessToken();
            if (newToken) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              return axios(originalRequest);
            }
          }

          return Promise.reject(error);
        }
      );
    }
  }

  // Session management
  startSessionTimer() {
    // Clear any existing timer
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer);
    }

    // Set session timeout (30 minutes)
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    
    this.sessionTimer = setTimeout(() => {
      alert('Your session has expired. Please login again.');
      this.logout();
    }, SESSION_TIMEOUT);
  }

  // Reset session timer on activity
  resetSessionTimer() {
    this.startSessionTimer();
  }

  // Check session validity
  async checkSession() {
    try {
      const response = await axios.get(`${API_BASE_URL}/auth/check`);
      return response.data.valid;
    } catch (error) {
      return false;
    }
  }
}

// Create singleton instance
const authService = new AuthService();

// Initialize on import
authService.init();

export default authService;