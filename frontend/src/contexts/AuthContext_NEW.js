/**
 * Authentication Context - Single Source of Truth
 * Based on industry best practices (Facebook, Stripe, etc.)
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getApiBaseUrl } from '../config/apiBase';

const AuthContext = createContext(null);

// Token storage keys
const TOKEN_KEY = 'authToken';
const USER_KEY = 'pharma_user';

/**
 * Decode JWT and extract payload
 */
const decodeToken = (token) => {
  try {
    const actualToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    const parts = actualToken.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp <= now) {
      return null; // Expired
    }
    
    return payload;
  } catch (error) {
    console.error('Token decode failed:', error);
    return null;
  }
};

/**
 * AuthProvider Component
 */
export const AuthProvider = ({ children }) => {
  const [state, setState] = useState({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true
  });

  /**
   * Initialize auth from stored token on mount
   */
  useEffect(() => {
    const initAuth = () => {
      const token = localStorage.getItem(TOKEN_KEY);
      
      if (!token) {
        setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
        return;
      }

      const payload = decodeToken(token);
      
      if (!payload) {
        // Invalid or expired token - clear everything
        logout();
        setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
        return;
      }

      // Valid token - populate user state
      const user = {
        user_id: payload.user_id,
        email: payload.email,
        org_id: payload.org_id,
        role_id: payload.role_id,
        branch_id: payload.branch_id,
        permissions: payload.permissions || {}
      };

      setState({
        user,
        token,
        isAuthenticated: true,
        isLoading: false
      });
    };

    initAuth();
  }, []);

  /**
   * Login
   */
  const login = async (email, password) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Login failed');
      }

      const data = await response.json();
      
      if (!data.access_token) {
        throw new Error('No access token received');
      }

      // Decode token to get user info
      const payload = decodeToken(data.access_token);
      
      if (!payload) {
        throw new Error('Invalid token received');
      }

      const user = {
        user_id: payload.user_id,
        email: payload.email,
        org_id: payload.org_id,
        role_id: payload.role_id,
        branch_id: payload.branch_id,
        permissions: payload.permissions || {}
      };

      // Store token
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      // Update state
      setState({
        user,
        token: data.access_token,
        isAuthenticated: true,
        isLoading: false
      });

      return { success: true, user };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  };

  /**
   * Logout
   */
  const logout = () => {
    // Clear storage
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('pharma_token');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('pharma_org_id');
    localStorage.removeItem('org_id');
    localStorage.removeItem('pharma_branch_id');
    sessionStorage.clear();

    // Clear state
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false
    });
  };

  /**
   * Get org_id (helper)
   */
  const getOrgId = () => {
    return state.user?.org_id || null;
  };

  /**
   * Get token (helper)
   */
  const getToken = () => {
    return state.token;
  };

  const value = {
    ...state,
    login,
    logout,
    getOrgId,
    getToken
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * useAuth Hook
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export default AuthContext;
