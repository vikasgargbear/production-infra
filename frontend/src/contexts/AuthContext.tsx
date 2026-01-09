/**
 * Authentication Context - Single Source of Truth
 * TypeScript version with full type definitions
 * WITH OFFLINE SUPPORT for pharma distribution in low-connectivity areas
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getApiBaseUrl } from '../config/apiBase';
import { salesSyncService } from '../services/offline/modules/sales';

// Types
export interface User {
    user_id: number;
    email: string;
    org_id: number;
    role_id: number;
    branch_id?: number;
    permissions: Record<string, boolean>;
    auth_provider?: string;
}

export interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

export interface LoginResult {
    success: boolean;
    user?: User;
    error?: string;
    offline?: boolean;
}

export interface AuthContextValue extends AuthState {
    login: (email: string, password: string) => Promise<LoginResult>;
    loginWithGoogle: () => Promise<LoginResult | void>;
    handleOAuthCallback: (accessToken: string, userEmail: string, userName: string) => Promise<LoginResult>;
    logout: () => void;
    getOrgId: () => number | null;
    getToken: () => string | null;
    isOnline: boolean;
}

interface JWTPayload {
    user_id: number;
    email: string;
    org_id: number;
    role_id: number;
    branch_id?: number;
    permissions?: Record<string, boolean>;
    exp?: number;
    user_metadata?: {
        full_name?: string;
    };
}

interface OfflineCredentials {
    email: string;
    passwordHash: string;
    user: User;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Token storage keys
const TOKEN_KEY = 'authToken';
const USER_KEY = 'pharma_user';
const OFFLINE_CREDS_KEY = 'pharma_offline_creds';

/**
 * Decode JWT and extract payload
 */
const decodeToken = (token: string): JWTPayload | null => {
    try {
        const actualToken = token.startsWith('Bearer ') ? token.slice(7) : token;
        const parts = actualToken.split('.');
        if (parts.length !== 3) return null;

        const payload = JSON.parse(atob(parts[1])) as JWTPayload;

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

interface AuthProviderProps {
    children: ReactNode;
}

/**
 * AuthProvider Component
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [state, setState] = useState<AuthState>({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: true
    });

    const [isOnline, setIsOnline] = useState(navigator.onLine);

    /**
     * Simple password hash for offline verification
     */
    const hashPassword = (password: string): string => {
        let hash = 0;
        for (let i = 0; i < password.length; i++) {
            const char = password.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    };

    /**
     * Logout
     */
    const logout = () => {
        // Stop background sync and clear cache
        salesSyncService.stop();

        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem('pharma_token');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('pharma_org_id');
        localStorage.removeItem('org_id');
        localStorage.removeItem('pharma_branch_id');
        sessionStorage.clear();

        setState({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false
        });
    };

    /**
     * Offline login with cached credentials
     */
    const loginOffline = (email: string, password: string): LoginResult => {
        const offlineCredsStr = localStorage.getItem(OFFLINE_CREDS_KEY);
        if (!offlineCredsStr) {
            return { success: false, error: 'No offline credentials. Login online first.' };
        }

        try {
            const offlineCreds: OfflineCredentials = JSON.parse(offlineCredsStr);
            const passwordHash = hashPassword(password);

            if (offlineCreds.email === email && offlineCreds.passwordHash === passwordHash) {
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
        } catch {
            return { success: false, error: 'Offline login failed' };
        }
    };

    /**
     * Login (with offline fallback)
     */
    const login = async (email: string, password: string): Promise<LoginResult> => {
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

            const payload = decodeToken(data.access_token);

            if (!payload) {
                throw new Error('Invalid token received');
            }

            const user: User = {
                user_id: payload.user_id,
                email: payload.email,
                org_id: payload.org_id,
                role_id: payload.role_id,
                branch_id: payload.branch_id,
                permissions: payload.permissions || {}
            };

            localStorage.setItem(TOKEN_KEY, data.access_token);
            localStorage.setItem(USER_KEY, JSON.stringify(user));

            const offlineCreds: OfflineCredentials = {
                email,
                passwordHash: hashPassword(password),
                user
            };
            localStorage.setItem(OFFLINE_CREDS_KEY, JSON.stringify(offlineCreds));

            setState({
                user,
                token: data.access_token,
                isAuthenticated: true,
                isLoading: false
            });

            // CRITICAL: Start initial sync with memory cache warmup
            // This is NON-BLOCKING - UI is already auth'd and ready
            // Background: Sync data → Warm cache → Enable instant search
            salesSyncService.performInitialSync()
                .then(() => {
                    console.log('[Auth] ✅ Initial sync complete - App ready with instant performance!');
                })
                .catch((err: Error) => {
                    console.warn('[Auth] Initial sync failed:', err.message);
                    // App still works offline with cached data
                });

            return { success: true, user };
        } catch (error) {
            console.error('Online login failed, trying offline:', error);
            return loginOffline(email, password);
        }
    };

    /**
     * Login with Google OAuth
     */
    const loginWithGoogle = async (): Promise<LoginResult | void> => {
        try {
            const response = await fetch(`${getApiBaseUrl()}/api/auth/oauth/google/url`);

            if (!response.ok) {
                throw new Error('Failed to get Google OAuth URL');
            }

            const data = await response.json();

            if (data.url) {
                window.location.href = data.url;
            } else {
                throw new Error('No OAuth URL returned');
            }
        } catch (error) {
            console.error('Google login error:', error);
            return { success: false, error: (error as Error).message };
        }
    };

    /**
     * Handle OAuth callback
     */
    const handleOAuthCallback = async (
        accessToken: string,
        userEmail: string,
        userName: string
    ): Promise<LoginResult> => {
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

            const user: User = {
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
            return { success: false, error: (error as Error).message };
        }
    };

    /**
     * Get org_id helper
     */
    const getOrgId = (): number | null => {
        return state.user?.org_id || null;
    };

    /**
     * Get token helper
     */
    const getToken = (): string | null => {
        return state.token;
    };

    /**
     * Initialize auth from stored token on mount
     */
    useEffect(() => {
        const initAuth = async () => {
            // Check for OAuth callback
            const hash = window.location.hash;
            if (hash && hash.includes('access_token')) {
                try {
                    const params = new URLSearchParams(hash.substring(1));
                    const accessToken = params.get('access_token');

                    if (accessToken) {
                        const supabasePayload = decodeToken(accessToken);

                        if (supabasePayload && supabasePayload.email) {
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
                                        const user: User = {
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
                                const errorMessage = errorData?.detail?.message || errorData?.detail || 'Google login failed.';
                                alert(errorMessage);
                                window.history.replaceState(null, '', window.location.pathname);
                            }
                        }
                    }
                } catch (error) {
                    console.error('OAuth callback processing error:', error);
                    window.history.replaceState(null, '', window.location.pathname);
                }
            }

            // Normal auth check
            const token = localStorage.getItem(TOKEN_KEY);

            if (!token) {
                setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
                return;
            }

            const payload = decodeToken(token);

            if (!payload) {
                logout();
                setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
                return;
            }

            const user: User = {
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

            // Start background sync for existing session
            if (salesSyncService.isReady() || navigator.onLine) {
                salesSyncService.performInitialSync().catch((err) => {
                    console.warn('[Auth] Background sync failed for existing session:', err);
                });
            }
        };

        initAuth();
    }, []);

    // Online status
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

    const value: AuthContextValue = {
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
export const useAuth = (): AuthContextValue => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};

export default AuthContext;
