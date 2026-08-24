import React, {
    ReactNode,
    createContext,
    useCallback,
    useContext,
    useEffect,
    useRef,
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


export interface User {
    user_id: number | string;
    email: string;
    org_id: string;
    role_id: number | string | null;
    branch_id?: number | string;
    permissions: Record<string, boolean>;
    is_admin?: boolean;
    data_access_level?: string;
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
    authorizationFailure?: boolean;
}

export interface AuthContextValue extends AuthState {
    login: (email: string, password: string) => Promise<LoginResult>;
    loginWithGoogle: () => Promise<LoginResult | void>;
    handleOAuthCallback: (accessToken: string) => Promise<LoginResult>;
    logout: () => void;
    getOrgId: () => string | null;
    getToken: () => string | null;
    isOnline: boolean;
    hasCloudSession: boolean;
    sessionExchangeError: string | null;
    retrySessionExchange: () => Promise<LoginResult>;
}

interface JWTPayload {
    user_id: number | string;
    email: string;
    org_id: string;
    role_id: number | string | null;
    branch_id?: number | string;
    branch_ids?: Array<number | string>;
    permissions?: Record<string, boolean>;
    is_admin?: boolean;
    data_access_level?: string;
    auth_provider?: string;
    exp?: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const SESSION_EXCHANGE_RETRY_DELAYS_MS = [0, 1500, 3000] as const;
const SESSION_EXCHANGE_TIMEOUT_MS = 12000;
const TRANSIENT_SESSION_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

const wait = (delayMs: number): Promise<void> => (
    new Promise((resolve) => window.setTimeout(resolve, delayMs))
);

async function requestErpSession(accessToken: string): Promise<Response> {
    let networkError: unknown;

    for (const [attempt, delayMs] of SESSION_EXCHANGE_RETRY_DELAYS_MS.entries()) {
        if (delayMs > 0) await wait(delayMs);
        const controller = new AbortController();
        const timeoutId = window.setTimeout(
            () => controller.abort(),
            SESSION_EXCHANGE_TIMEOUT_MS,
        );
        try {
            const response = await fetch(`${getApiBaseUrl()}/api/auth/oauth/supabase/session`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: controller.signal,
            });
            const finalAttempt = attempt === SESSION_EXCHANGE_RETRY_DELAYS_MS.length - 1;
            if (!TRANSIENT_SESSION_STATUSES.has(response.status) || finalAttempt) {
                return response;
            }
        } catch (error) {
            networkError = error;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    throw networkError;
}

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
    const [hasCloudSession, setHasCloudSession] = useState(false);
    const [sessionExchangeError, setSessionExchangeError] = useState<string | null>(null);
    const pendingExchange = useRef<{
        accessToken: string;
        promise: Promise<LoginResult>;
    } | null>(null);

    const clearErpSession = useCallback(() => {
        clearErpSessionStorage();
        setHasCloudSession(false);
        setSessionExchangeError(null);
        setState({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }, []);

    const preserveCloudSessionFailure = useCallback((result: LoginResult) => {
        setHasCloudSession(true);
        setSessionExchangeError(result.error || 'The ERP session could not be established.');
        setState((previous) => {
            if (previous.isAuthenticated && !result.authorizationFailure) {
                return { ...previous, isLoading: false };
            }
            clearErpSessionStorage();
            return { user: null, token: null, isAuthenticated: false, isLoading: false };
        });
    }, []);

    const exchangeSupabaseSession = useCallback((accessToken: string): Promise<LoginResult> => {
        if (pendingExchange.current?.accessToken === accessToken) {
            return pendingExchange.current.promise;
        }

        const promise = (async (): Promise<LoginResult> => {
            try {
                const response = await requestErpSession(accessToken);
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    return {
                        success: false,
                        error: errorMessage(data, 'ERP access is not authorized'),
                        authorizationFailure: response.status === 401 || response.status === 403,
                    };
                }

                const payload = decodeToken(data.access_token);
                if (!payload) {
                    return { success: false, error: 'The ERP session response was invalid' };
                }
                const primaryBranch = payload.branch_id ?? payload.branch_ids?.[0];
                const user: User = {
                    user_id: payload.user_id,
                    email: payload.email,
                    org_id: payload.org_id,
                    role_id: payload.role_id,
                    branch_id: primaryBranch,
                    permissions: payload.permissions || {},
                    is_admin: payload.is_admin === true,
                    data_access_level: payload.data_access_level,
                    auth_provider: payload.auth_provider,
                };

                saveErpSession(data.access_token, user);
                setHasCloudSession(true);
                setSessionExchangeError(null);
                setState({ user, token: data.access_token, isAuthenticated: true, isLoading: false });
                return { success: true, user };
            } catch {
                return {
                    success: false,
                    error: 'The ERP service is starting. Please try signing in again in a moment.',
                };
            }
        })();

        pendingExchange.current = { accessToken, promise };
        void promise.then(() => {
            if (pendingExchange.current?.promise === promise) pendingExchange.current = null;
        });
        return promise;
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
            setHasCloudSession(true);
            const result = await exchangeSupabaseSession(data.session.access_token);
            if (!result.success) preserveCloudSessionFailure(result);
            return result;
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Login failed' };
        }
    }, [exchangeSupabaseSession, preserveCloudSessionFailure]);

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

    const retrySessionExchange = useCallback(async (): Promise<LoginResult> => {
        if (!navigator.onLine) {
            const result = { success: false, error: 'An internet connection is required to connect to ERP.' };
            setSessionExchangeError(result.error);
            return result;
        }
        try {
            const { data, error } = await getSupabaseClient().auth.getSession();
            if (error || !data.session) {
                const result = { success: false, error: error?.message || 'Your cloud session has ended. Please sign in again.' };
                clearErpSession();
                return result;
            }
            setHasCloudSession(true);
            setSessionExchangeError(null);
            setState((previous) => ({ ...previous, isLoading: !previous.isAuthenticated }));
            const result = await exchangeSupabaseSession(data.session.access_token);
            if (!result.success) preserveCloudSessionFailure(result);
            return result;
        } catch (error) {
            const result = {
                success: false,
                error: error instanceof Error ? error.message : 'Unable to reconnect to ERP.',
            };
            preserveCloudSessionFailure(result);
            return result;
        }
    }, [clearErpSession, exchangeSupabaseSession, preserveCloudSessionFailure]);

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
            setHasCloudSession(true);
            const result = await exchangeSupabaseSession(data.session.access_token);
            if (active && !result.success) preserveCloudSessionFailure(result);
        }).catch(() => {
            if (active) {
                const result = { success: false, error: 'Unable to read the cloud session. Please retry.' };
                preserveCloudSessionFailure(result);
            }
        });

        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            if (!active) return;
            if (event === 'SIGNED_OUT' || !session) {
                clearErpSession();
                return;
            }
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                setHasCloudSession(true);
                void exchangeSupabaseSession(session.access_token).then((result) => {
                    if (active && !result.success) preserveCloudSessionFailure(result);
                });
            }
        });

        return () => {
            active = false;
            listener.subscription.unsubscribe();
        };
    }, [clearErpSession, exchangeSupabaseSession, preserveCloudSessionFailure]);

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
        hasCloudSession,
        sessionExchangeError,
        retrySessionExchange,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};


export const useAuth = (): AuthContextValue => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};


export default AuthContext;
