import React, {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';
import { getApiBaseUrl } from '../config/apiBase';
import { getSupabaseClient } from '../services/auth/supabaseClient';
import { googleAuthReturnUrl } from '../services/auth/oauthConsentClient';
import {
    clearErpSessionStorage,
    removeLegacyErpSessionKeys,
    saveErpSession,
} from '../services/auth/erpSessionStorage';
import { salesSyncService } from '../services/offline/modules/sales';


export interface User {
    user_id: number;
    email: string;
    org_id: string;
    role_id: number | null;
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
}

export interface AuthContextValue extends AuthState {
    login: (email: string, password: string) => Promise<LoginResult>;
    loginWithGoogle: () => Promise<LoginResult | void>;
    handleOAuthCallback: (accessToken: string) => Promise<LoginResult>;
    logout: () => void;
    getOrgId: () => string | null;
    getToken: () => string | null;
    isOnline: boolean;
}

interface JWTPayload {
    user_id: number;
    email: string;
    org_id: string;
    role_id: number | null;
    branch_id?: number;
    branch_ids?: Array<number | string>;
    permissions?: Record<string, boolean>;
    auth_provider?: string;
    exp?: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);
function decodeToken(token: string): JWTPayload | null {
    try {
        const encodedPayload = token.replace(/^Bearer\s+/i, '').split('.')[1];
        if (!encodedPayload) return null;
        const normalized = encodedPayload.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
        const payload = JSON.parse(atob(padded)) as JWTPayload;
        if (payload.exp && payload.exp <= Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}


function errorMessage(body: any, fallback: string): string {
    if (typeof body?.detail === 'string') return body.detail;
    if (typeof body?.detail?.message === 'string') return body.detail.message;
    if (typeof body?.message === 'string') return body.message;
    return fallback;
}


interface AuthProviderProps {
    children: ReactNode;
}


export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [state, setState] = useState<AuthState>({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: true,
    });
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    const clearErpSession = useCallback(() => {
        salesSyncService.stop();
        clearErpSessionStorage();
        setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }, []);

    const exchangeSupabaseSession = useCallback(async (accessToken: string): Promise<LoginResult> => {
        const response = await fetch(`${getApiBaseUrl()}/api/auth/oauth/supabase/session`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return { success: false, error: errorMessage(data, 'ERP access is not authorized') };
        }

        const payload = decodeToken(data.access_token);
        if (!payload) {
            return { success: false, error: 'The ERP session response was invalid' };
        }
        const primaryBranch = payload.branch_id ?? Number(payload.branch_ids?.[0]);
        const user: User = {
            user_id: payload.user_id,
            email: payload.email,
            org_id: payload.org_id,
            role_id: payload.role_id,
            branch_id: Number.isFinite(primaryBranch) ? primaryBranch : undefined,
            permissions: payload.permissions || {},
            auth_provider: payload.auth_provider,
        };

        saveErpSession(data.access_token, user);
        setState({ user, token: data.access_token, isAuthenticated: true, isLoading: false });
        Promise.resolve(salesSyncService.performInitialSync()).catch((error: Error) => {
            console.warn('[Auth] Initial sync failed:', error.message);
        });
        return { success: true, user };
    }, []);

    const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
        if (!navigator.onLine) {
            return { success: false, error: 'An internet connection is required to sign in.' };
        }
        try {
            const { data, error } = await getSupabaseClient().auth.signInWithPassword({
                email: email.trim(),
                password,
            });
            if (error) return { success: false, error: error.message };
            if (!data.session) return { success: false, error: 'Email verification is required' };
            const result = await exchangeSupabaseSession(data.session.access_token);
            if (!result.success) await getSupabaseClient().auth.signOut();
            return result;
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Login failed' };
        }
    }, [exchangeSupabaseSession]);

    const loginWithGoogle = useCallback(async (): Promise<LoginResult | void> => {
        if (!navigator.onLine) {
            return { success: false, error: 'An internet connection is required to sign in.' };
        }
        try {
            const { error } = await getSupabaseClient().auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: googleAuthReturnUrl(window.location),
                    queryParams: { prompt: 'select_account' },
                },
            });
            if (error) return { success: false, error: error.message };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Google login failed' };
        }
    }, []);

    const logout = useCallback(() => {
        try {
            void getSupabaseClient().auth.signOut().catch(() => undefined);
        } catch {
            // Local ERP state must still be cleared if auth is misconfigured.
        }
        clearErpSession();
    }, [clearErpSession]);

    useEffect(() => {
        removeLegacyErpSessionKeys();

        let active = true;
        let supabase;
        try {
            supabase = getSupabaseClient();
        } catch {
            clearErpSession();
            return;
        }
        void supabase.auth.getSession().then(async ({ data, error }) => {
            if (!active) return;
            if (error || !data.session) {
                clearErpSession();
                return;
            }
            const result = await exchangeSupabaseSession(data.session.access_token);
            if (active && !result.success) clearErpSession();
        }).catch(() => {
            if (active) clearErpSession();
        });

        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            if (!active) return;
            if (event === 'SIGNED_OUT' || !session) {
                clearErpSession();
                return;
            }
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                void exchangeSupabaseSession(session.access_token);
            }
        });

        return () => {
            active = false;
            listener.subscription.unsubscribe();
        };
    }, [clearErpSession, exchangeSupabaseSession]);

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
        handleOAuthCallback: exchangeSupabaseSession,
        logout,
        getOrgId: () => state.user?.org_id || null,
        getToken: () => state.token,
        isOnline,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};


export const useAuth = (): AuthContextValue => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};


export default AuthContext;
