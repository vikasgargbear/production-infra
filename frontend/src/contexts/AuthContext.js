/**
 * Authentication Context - Single Source of Truth
 * Based on industry best practices (Facebook, Stripe, etc.)
 * WITH OFFLINE SUPPORT for pharma distribution in low-connectivity areas
 */

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getApiBaseUrl } from '../config/apiBase';
import syncPullService from '../services/offline/sync/syncPullService';

const AuthContext = createContext(null);

// Token storage keys
const TOKEN_KEY = 'authToken';
const USER_KEY = 'pharma_user';
const OFFLINE_CREDS_KEY = 'pharma_offline_creds';

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
    const initAuth = async () => {
      // Check for OAuth callback (Supabase redirects with tokens in URL hash)
      const hash = window.location.hash;
      if (hash && hash.includes('access_token')) {
        try {
          // Parse tokens from hash (format: #access_token=xxx&refresh_token=xxx&...)
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken) {
            // Decode the Supabase token to get user email
            const supabasePayload = decodeToken(accessToken);

            if (supabasePayload && supabasePayload.email) {
              // Call our backend to exchange Supabase token for our JWT
              const response = await fetch(`${getApiBaseUrl()}/api/auth/oauth/google/callback`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  provider: 'google',
                  access_token: accessToken,
                  user_email: supabasePayload.email,
                  user_name: supabasePayload.user_metadata?.full_name || supabasePayload.email
                })
              });

              if (response.ok) {
                const data = await response.json();

                if (data.access_token) {
                  const payload = decodeToken(data.access_token);

                  if (payload) {
                    const user = {
                      user_id: payload.user_id,
                      email: payload.email,
                      org_id: payload.org_id,
                      role_id: payload.role_id,
                      branch_id: payload.branch_id,
                      permissions: payload.permissions || {},
                      auth_provider: 'google'
                    };

                    localStorage.setItem(TOKEN_KEY, data.access_token);
                    localStorage.setItem(USER_KEY, JSON.stringify(user));

                    // Clear URL hash
                    window.history.replaceState(null, '', window.location.pathname);

                    setState({
                      user,
                      token: data.access_token,
                      isAuthenticated: true,
                      isLoading: false
                    });
                    return;
                  }
                }
              } else {
                const errorData = await response.json();
                console.error('OAuth callback failed:', errorData);

                // Show user-friendly error
                const errorMessage = errorData?.detail?.message || errorData?.detail || 'Google login failed. Your account may not exist.';
                alert(errorMessage);

                // Clear URL hash and show login
                window.history.replaceState(null, '', window.location.pathname);
              }
            }
          }
        } catch (error) {
          console.error('OAuth callback processing error:', error);
          window.history.replaceState(null, '', window.location.pathname);
        }
      }

      // Normal auth check from localStorage
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
   * Simple password hash for offline verification
   */
  const hashPassword = (password) => {
    // Simple hash - in production use bcrypt or similar
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  };

  /**
   * Offline login with cached credentials
   */
  const loginOffline = (email, password) => {
    const offlineCredsStr = localStorage.getItem(OFFLINE_CREDS_KEY);
    if (!offlineCredsStr) {
      return { success: false, error: 'No offline credentials. Login online first.' };
    }

    try {
      const offlineCreds = JSON.parse(offlineCredsStr);
      const passwordHash = hashPassword(password);

      if (offlineCreds.email === email && offlineCreds.passwordHash === passwordHash) {
        // Valid offline login
        const user = offlineCreds.user;
        const offlineToken = `offline.${btoa(JSON.stringify(user))}.${Date.now()}`;

        localStorage.setItem(TOKEN_KEY, offlineToken);
        localStorage.setItem(USER_KEY, JSON.stringify(user));

        setState({
          user,
          token: offlineToken,
          isAuthenticated: true,
          isLoading: false
        });

        return { success: true, user, offline: true };
      }

      return { success: false, error: 'Invalid offline credentials' };
    } catch (error) {
      return { success: false, error: 'Offline login failed' };
    }
  };

  /**
   * Login (with offline fallback)
   */
  const login = async (email, password) => {
    // Check if online
    if (!navigator.onLine) {
      return loginOffline(email, password);
    }

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

      // Store for offline login
      const offlineCreds = {
        email,
        passwordHash: hashPassword(password),
        user
      };
      localStorage.setItem(OFFLINE_CREDS_KEY, JSON.stringify(offlineCreds));

      // Update state
      setState({
        user,
        token: data.access_token,
        isAuthenticated: true,
        isLoading: false
      });

      // OFFLINE SYNC: Download all data for offline use (non-blocking)
      // This runs in background so login completes immediately
      syncPullService.fullSync().catch(err => {
        console.warn('[Auth] Offline sync failed (will retry later):', err.message);
      });

      return { success: true, user };
    } catch (error) {
      console.error('Online login failed, trying offline:', error);
      // Fallback to offline
      return loginOffline(email, password);
    }
  };

  /**
   * Login with Google OAuth
   */
  const loginWithGoogle = async () => {
    try {
      // Get OAuth URL from backend
      const response = await fetch(`${getApiBaseUrl()}/api/auth/oauth/google/url`);

      if (!response.ok) {
        throw new Error('Failed to get Google OAuth URL');
      }

      const data = await response.json();

      if (data.url) {
        // Redirect to Google OAuth (via Supabase)
        window.location.href = data.url;
      } else {
        throw new Error('No OAuth URL returned');
      }
    } catch (error) {
      console.error('Google login error:', error);
      return { success: false, error: error.message };
    }
  };

  /**
   * Handle OAuth callback (called after Google redirects back)
   */
  const handleOAuthCallback = async (accessToken, userEmail, userName) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth/oauth/google/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'google',
          access_token: accessToken,
          user_email: userEmail,
          user_name: userName
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail?.message || 'OAuth callback failed');
      }

      const data = await response.json();

      if (!data.access_token) {
        throw new Error('No access token received');
      }

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
        permissions: payload.permissions || {},
        auth_provider: 'google'
      };

      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));

      setState({
        user,
        token: data.access_token,
        isAuthenticated: true,
        isLoading: false
      });

      return { success: true, user };
    } catch (error) {
      console.error('OAuth callback error:', error);
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

  /**
   * Check online status
   */
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const value = {
    ...state,
    login,
    loginWithGoogle,
    handleOAuthCallback,
    logout,
    getOrgId,
    getToken,
    isOnline
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
