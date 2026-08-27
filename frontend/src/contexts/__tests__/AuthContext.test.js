import React, { useContext } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import AuthContext, { AuthProvider } from '../AuthContext';


const mockSignInWithPassword = jest.fn();
const mockSignInWithOAuth = jest.fn();
const mockSignOut = jest.fn();
const mockGetSession = jest.fn();
const mockUnsubscribe = jest.fn();
let mockAuthStateCallback;


jest.mock('../../services/auth/supabaseClient', () => ({
    getSupabaseClient: () => ({
        auth: {
            signInWithPassword: mockSignInWithPassword,
            signInWithOAuth: mockSignInWithOAuth,
            signOut: mockSignOut,
            getSession: mockGetSession,
            onAuthStateChange: (callback) => {
                mockAuthStateCallback = callback;
                return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
            },
        },
    }),
}));

function token(overrides = {}) {
    const payload = {
        user_id: 42,
        email: 'staff@example.com',
        org_id: '11111111-1111-1111-1111-111111111111',
        role_id: 7,
        branch_ids: [3],
        permissions: { inventory: true },
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...overrides,
    };
    const encoded = btoa(JSON.stringify(payload))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    return `header.${encoded}.signature`;
}


let currentAuth;
function Probe() {
    currentAuth = useContext(AuthContext);
    return <div>{currentAuth?.isAuthenticated ? 'authenticated' : 'anonymous'}</div>;
}


beforeEach(() => {
    jest.clearAllMocks();
    mockAuthStateCallback = undefined;
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignOut.mockResolvedValue({ error: null });
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: token() }),
    });
});


test('email password is sent only to Supabase and ERP receives the bearer token', async () => {
    mockSignInWithPassword.mockResolvedValue({
        data: { session: { access_token: 'supabase-access' } },
        error: null,
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    let result;
    await act(async () => {
        result = await currentAuth.login(' staff@example.com ', 'private-password');
    });

    expect(result.success).toBe(true);
    expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'staff@example.com',
        password: 'private-password',
    });
    expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/oauth/supabase/session'),
        {
            method: 'POST',
            headers: { Authorization: 'Bearer supabase-access' },
            signal: expect.any(AbortSignal),
        },
    );
    expect(JSON.stringify(fetch.mock.calls)).not.toContain('private-password');
});


test('Google login uses Supabase PKCE redirect on the current origin', async () => {
    mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    await act(async () => currentAuth.loginWithGoogle());

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
            redirectTo: window.location.origin,
            queryParams: { prompt: 'select_account' },
        },
    });
});


test('Google login returns to the exact consent request without carrying other query data', async () => {
    window.history.replaceState(
        {},
        '',
        '/oauth/consent?authorization_id=authorization_123456789&untrusted=value',
    );
    mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    await act(async () => currentAuth.loginWithGoogle());

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
            redirectTo: `${window.location.origin}/oauth/consent?authorization_id=authorization_123456789`,
            queryParams: { prompt: 'select_account' },
        },
    });
});


test('Supabase token refresh silently renews the ERP session', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(mockAuthStateCallback).toBeDefined());

    await act(async () => {
        mockAuthStateCallback('TOKEN_REFRESHED', { access_token: 'rotated-access' });
    });

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/oauth/supabase/session'),
        expect.objectContaining({
            headers: { Authorization: 'Bearer rotated-access' },
            signal: expect.any(AbortSignal),
        }),
    ));
    expect(currentAuth.isAuthenticated).toBe(true);
});


test('identical concurrent ERP session exchanges share one backend request', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    let resolveExchange;
    fetch.mockImplementationOnce(() => new Promise((resolve) => {
        resolveExchange = resolve;
    }));

    let firstExchange;
    let secondExchange;
    act(() => {
        firstExchange = currentAuth.handleOAuthCallback('shared-supabase-access');
        secondExchange = currentAuth.handleOAuthCallback('shared-supabase-access');
    });

    expect(secondExchange).toBe(firstExchange);
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
        resolveExchange({
            ok: true,
            json: async () => ({ access_token: token() }),
        });
        await firstExchange;
    });

    expect(currentAuth.isAuthenticated).toBe(true);
});


test('ERP session exchange retries a transient network failure', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));
    jest.useFakeTimers();

    fetch
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: token() }),
        });

    let resultPromise;
    act(() => {
        resultPromise = currentAuth.handleOAuthCallback('retry-supabase-access');
    });
    await act(async () => Promise.resolve());
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
        jest.advanceTimersByTime(1500);
        await Promise.resolve();
    });
    let result;
    await act(async () => {
        result = await resultPromise;
    });
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(fetch).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
});


test('ERP session exchange retries transient HTTP failures', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));
    jest.useFakeTimers();

    fetch
        .mockResolvedValueOnce({
            ok: false,
            status: 503,
            json: async () => ({ detail: 'Service starting' }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ access_token: token() }),
        });

    let resultPromise;
    act(() => {
        resultPromise = currentAuth.handleOAuthCallback('retry-http-access');
    });
    await act(async () => Promise.resolve());
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
        jest.advanceTimersByTime(1500);
        await Promise.resolve();
    });
    await expect(resultPromise).resolves.toEqual(expect.objectContaining({ success: true }));
    expect(fetch).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
});


test('a transient token-refresh failure preserves the last valid ERP session', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    await act(async () => {
        mockAuthStateCallback('SIGNED_IN', { access_token: 'initial-access' });
    });
    await waitFor(() => expect(currentAuth.isAuthenticated).toBe(true));

    jest.useFakeTimers();
    fetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ detail: 'Service starting' }),
    });

    act(() => {
        mockAuthStateCallback('TOKEN_REFRESHED', { access_token: 'rotated-access' });
    });
    await act(async () => Promise.resolve());
    await act(async () => {
        jest.advanceTimersByTime(1500);
        await Promise.resolve();
    });
    await act(async () => {
        jest.advanceTimersByTime(3000);
        await Promise.resolve();
        await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(4);
    expect(currentAuth.isAuthenticated).toBe(true);
    expect(mockSignOut).not.toHaveBeenCalled();
    jest.useRealTimers();
});


test('cold-start ERP failure preserves the Supabase session and supports explicit retry', async () => {
    jest.useFakeTimers();
    mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'cold-start-access' } },
        error: null,
    });
    fetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ detail: 'ERP is starting' }),
    });

    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => Promise.resolve());
    await act(async () => {
        jest.advanceTimersByTime(1500);
        await Promise.resolve();
    });
    await act(async () => {
        jest.advanceTimersByTime(3000);
        await Promise.resolve();
        await Promise.resolve();
    });

    expect(currentAuth.isAuthenticated).toBe(false);
    expect(currentAuth.hasCloudSession).toBe(true);
    expect(currentAuth.sessionExchangeError).toBe('ERP is starting');
    expect(mockSignOut).not.toHaveBeenCalled();

    fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ access_token: token() }),
    });
    let retry;
    await act(async () => {
        retry = await currentAuth.retrySessionExchange();
    });
    expect(retry.success).toBe(true);
    expect(currentAuth.isAuthenticated).toBe(true);
    expect(currentAuth.sessionExchangeError).toBeNull();
    jest.useRealTimers();
});


test('cold-start ERP authorization failure waits for explicit sign out', async () => {
    mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'unauthorized-access' } },
        error: null,
    });
    fetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'ERP access is not reviewed' }),
    });

    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    expect(currentAuth.hasCloudSession).toBe(true);
    expect(currentAuth.sessionExchangeError).toBe('ERP access is not reviewed');
    expect(mockSignOut).not.toHaveBeenCalled();

    act(() => currentAuth.logout());
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(currentAuth.hasCloudSession).toBe(false);
});


test('an authorization failure on token refresh clears the ERP session', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    await act(async () => {
        mockAuthStateCallback('SIGNED_IN', { access_token: 'initial-access' });
    });
    await waitFor(() => expect(currentAuth.isAuthenticated).toBe(true));

    fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'ERP access revoked' }),
    });
    await act(async () => {
        mockAuthStateCallback('TOKEN_REFRESHED', { access_token: 'revoked-access' });
    });

    await waitFor(() => expect(currentAuth.isAuthenticated).toBe(false));
});


test('a newer successful token exchange is not erased by an older membership denial', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    let resolveOldExchange;
    let resolveNewExchange;
    fetch.mockImplementation((_url, options) => {
        const authorization = options?.headers?.Authorization;
        if (authorization === 'Bearer old-access') {
            return new Promise((resolve) => {
                resolveOldExchange = resolve;
            });
        }
        if (authorization === 'Bearer provisioned-access') {
            return new Promise((resolve) => {
                resolveNewExchange = resolve;
            });
        }
        throw new Error(`Unexpected authorization: ${authorization}`);
    });

    act(() => {
        mockAuthStateCallback('SIGNED_IN', { access_token: 'old-access' });
        mockAuthStateCallback('TOKEN_REFRESHED', { access_token: 'provisioned-access' });
    });

    await act(async () => {
        resolveNewExchange({
            ok: true,
            status: 200,
            json: async () => ({ access_token: token() }),
        });
        await Promise.resolve();
    });
    await waitFor(() => expect(currentAuth.isAuthenticated).toBe(true));

    await act(async () => {
        resolveOldExchange({
            ok: false,
            status: 403,
            json: async () => ({
                detail: {
                    error: 'erp_membership_required',
                    message: 'Your identity is not linked to an active ERP organization.',
                },
            }),
        });
        await Promise.resolve();
    });

    expect(currentAuth.isAuthenticated).toBe(true);
    expect(currentAuth.sessionExchangeError).toBeNull();
});


test('explicit retry rechecks membership with the same cloud token after provisioning', async () => {
    mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'provisioned-in-place-access' } },
        error: null,
    });
    fetch
        .mockResolvedValueOnce({
            ok: false,
            status: 403,
            json: async () => ({
                detail: {
                    error: 'erp_membership_required',
                    message: 'Your identity is not linked to an active ERP organization.',
                },
            }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ access_token: token() }),
        });

    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));
    expect(currentAuth.isAuthenticated).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
        await currentAuth.retrySessionExchange();
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(currentAuth.isAuthenticated).toBe(true);
    expect(currentAuth.sessionExchangeError).toBeNull();
});


test('offline browsers cannot authenticate from cached credentials', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    const result = await currentAuth.login('staff@example.com', 'private-password');

    expect(result).toEqual({
        success: false,
        error: 'An internet connection is required to sign in.',
    });
    expect(mockSignInWithPassword).not.toHaveBeenCalled();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});
