import React, { useContext } from 'react';
import { act, render, waitFor } from '@testing-library/react';
import AuthContext, { AuthProvider } from '../AuthContext';


const mockSignInWithOAuth = jest.fn();
const mockSignInWithIdToken = jest.fn();
const mockSignOut = jest.fn();
const mockGetSession = jest.fn();
const mockUnsubscribe = jest.fn();
let mockAuthStateCallback;
let mockNativeGoogleAvailable = false;
const mockSignInWithNativeGoogle = jest.fn();
const mockClearNativeGoogleCredentialState = jest.fn();


jest.mock('../../services/auth/supabaseClient', () => ({
    getSupabaseClient: () => ({
        auth: {
            signInWithOAuth: mockSignInWithOAuth,
            signInWithIdToken: mockSignInWithIdToken,
            signOut: mockSignOut,
            getSession: mockGetSession,
            onAuthStateChange: (callback) => {
                mockAuthStateCallback = callback;
                return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
            },
        },
    }),
}));

jest.mock('../../services/mobile/nativeGoogleAuth', () => ({
    clearNativeGoogleCredentialState: () => mockClearNativeGoogleCredentialState(),
    isNativeGoogleAuthAvailable: () => mockNativeGoogleAvailable,
    nativeGoogleAuthErrorCode: (error) => error?.code || null,
    shouldUseGoogleBrowserFallback: (error) => [
        'CONFIGURATION_MISSING',
        'NATIVE_AUTH_UNAVAILABLE',
        'NATIVE_SIGN_IN_FAILED',
        'NO_CREDENTIAL',
    ].includes(error?.code),
    signInWithNativeGoogle: () => mockSignInWithNativeGoogle(),
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
    mockNativeGoogleAvailable = false;
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
    mockSignOut.mockResolvedValue({ error: null });
    mockClearNativeGoogleCredentialState.mockResolvedValue(undefined);
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: token() }),
    });
});


test('does not expose unsupported email and password authentication', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));
    expect(currentAuth.login).toBeUndefined();
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


test('Android Google login exchanges a native ID token without opening browser OAuth', async () => {
    mockNativeGoogleAvailable = true;
    mockSignInWithNativeGoogle.mockResolvedValue({
        idToken: 'header.google.signature',
        nonce: 'raw-native-nonce',
    });
    mockSignInWithIdToken.mockResolvedValue({
        data: { session: { access_token: 'native-supabase-access' } },
        error: null,
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    let result;
    await act(async () => {
        result = await currentAuth.loginWithGoogle();
    });

    expect(mockSignInWithIdToken).toHaveBeenCalledWith({
        provider: 'google',
        token: 'header.google.signature',
        nonce: 'raw-native-nonce',
    });
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ success: true }));
});


test('dismissing the Android account picker does not unexpectedly open Chrome', async () => {
    mockNativeGoogleAvailable = true;
    mockSignInWithNativeGoogle.mockRejectedValue(
        Object.assign(new Error('cancelled'), { code: 'AUTH_CANCELLED' }),
    );
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    let result;
    await act(async () => {
        result = await currentAuth.loginWithGoogle();
    });

    expect(result).toEqual({ success: false });
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
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


test('Google login preserves an organization invitation through the OAuth redirect', async () => {
    window.history.replaceState({}, '', '/?invitation_token=invite_abc12345&untrusted=value');
    mockSignInWithOAuth.mockResolvedValue({ data: {}, error: null });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    await act(async () => currentAuth.loginWithGoogle());

    expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
            redirectTo: `${window.location.origin}/?invitation_token=invite_abc12345`,
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


test('maintenance on token refresh clears only ERP state without retrying or signing out cloud auth', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    await act(async () => {
        mockAuthStateCallback('SIGNED_IN', { access_token: 'initial-access' });
    });
    await waitFor(() => expect(currentAuth.isAuthenticated).toBe(true));
    expect(sessionStorage.getItem('authToken')).toBeTruthy();

    fetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
            detail: {
                error: 'erp_maintenance',
                message: 'ERP is in maintenance while canonical data is provisioned.',
            },
        }),
    });
    await act(async () => {
        mockAuthStateCallback('TOKEN_REFRESHED', { access_token: 'rotated-access' });
    });

    await waitFor(() => expect(currentAuth.isAuthenticated).toBe(false));
    expect(currentAuth.hasCloudSession).toBe(true);
    expect(currentAuth.sessionExchangeError).toBe(
        'ERP is in maintenance while canonical data is provisioned.',
    );
    expect(sessionStorage.getItem('authToken')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mockSignOut).not.toHaveBeenCalled();
});


test('cold-start maintenance returns immediately and preserves the cloud session', async () => {
    jest.useFakeTimers();
    mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'maintenance-access' } },
        error: null,
    });
    fetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
            detail: {
                error: 'erp_maintenance',
                message: 'Canonical provisioning is still in progress.',
            },
        }),
    });

    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(currentAuth.isLoading).toBe(false);
    expect(currentAuth.isAuthenticated).toBe(false);
    expect(currentAuth.hasCloudSession).toBe(true);
    expect(currentAuth.sessionExchangeError).toBe(
        'Canonical provisioning is still in progress.',
    );
    expect(mockSignOut).not.toHaveBeenCalled();
    jest.useRealTimers();
});


test('cold-start maintenance reconnects automatically after authority recovers', async () => {
    jest.useFakeTimers();
    mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'maintenance-recovery-access' } },
        error: null,
    });
    fetch
        .mockResolvedValueOnce({
            ok: false,
            status: 503,
            json: async () => ({
                detail: {
                    error: 'erp_maintenance',
                    message: 'Canonical authority is temporarily unavailable.',
                },
            }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ access_token: token() }),
        });

    render(<AuthProvider><Probe /></AuthProvider>);
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(currentAuth.isAuthenticated).toBe(false);
    expect(currentAuth.hasCloudSession).toBe(true);

    await act(async () => {
        jest.advanceTimersByTime(15000);
        await Promise.resolve();
        await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(currentAuth.isAuthenticated).toBe(true);
    expect(currentAuth.sessionExchangeError).toBeNull();
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


test('typed membership failure exposes organization onboarding without treating maintenance as onboarding', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));
    fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
            detail: {
                error: 'onboarding_required',
                message: 'Create an organization or accept an invitation.',
            },
        }),
    });

    await act(async () => currentAuth.handleOAuthCallback('new-google-user-access'));

    expect(currentAuth.hasCloudSession).toBe(true);
    expect(currentAuth.onboardingRequired).toBe(true);
    expect(currentAuth.isAuthenticated).toBe(false);
});


test('organization creation uses the Supabase bearer and exchanges a new ERP session', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));
    mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'new-owner-supabase-access' } },
        error: null,
    });
    fetch
        .mockResolvedValueOnce({
            ok: true,
            status: 201,
            json: async () => ({ organization_id: 'org-1', membership_id: 'membership-1' }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ access_token: token() }),
        });
    let result;
    await act(async () => {
        result = await currentAuth.createOrganization({
            legal_name: 'Acme Pharma Private Limited',
            trade_name: 'Acme Pharma',
            address_line1: '42 Market Road',
            city: 'Mumbai',
            state_code: '27',
            postal_code: '400001',
        });
    });

    expect(fetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/api/auth/onboarding/organizations'),
        {
            method: 'POST',
            headers: {
                Authorization: 'Bearer new-owner-supabase-access',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                legal_name: 'Acme Pharma Private Limited',
                trade_name: 'Acme Pharma',
                address_line1: '42 Market Road',
                city: 'Mumbai',
                state_code: '27',
                postal_code: '400001',
            }),
        },
    );
    expect(fetch).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('/api/auth/oauth/supabase/session'),
        expect.objectContaining({ headers: { Authorization: 'Bearer new-owner-supabase-access' } }),
    );
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(currentAuth.isAuthenticated).toBe(true);
});


test('organization creation returns field-specific validation errors', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));
    mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'new-owner-supabase-access' } },
        error: null,
    });
    fetch.mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: async () => ({
            detail: [
                {
                    type: 'string_too_short',
                    loc: ['body', 'address_line1'],
                    msg: 'String should have at least 5 characters',
                },
            ],
        }),
    });

    let result;
    await act(async () => {
        result = await currentAuth.createOrganization({
            legal_name: 'Acme Pharma Private Limited',
            trade_name: '',
            address_line1: 'A',
            city: 'Mumbai',
            state_code: '27',
            postal_code: '400001',
        });
    });

    expect(result).toEqual({
        success: false,
        error: 'Check the highlighted organization details.',
        fieldErrors: {
            address_line1: 'Enter an address with at least 5 characters.',
        },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
});


test('invitation acceptance uses the URL token contract and exchanges an ERP session', async () => {
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));
    mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'invitee-supabase-access' } },
        error: null,
    });
    fetch
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ organization_id: 'org-1', membership_id: 'membership-2' }),
        })
        .mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({ access_token: token() }),
        });
    await act(async () => currentAuth.acceptInvitation(' invite_abc12345 '));

    expect(fetch).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('/api/auth/onboarding/invitations/accept'),
        expect.objectContaining({
            headers: {
                Authorization: 'Bearer invitee-supabase-access',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ invitation_token: 'invite_abc12345' }),
        }),
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(currentAuth.isAuthenticated).toBe(true);
});


test('offline browsers cannot begin Google authentication', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(currentAuth.isLoading).toBe(false));

    const result = await currentAuth.loginWithGoogle();

    expect(result).toEqual({
        success: false,
        error: 'An internet connection is required to sign in.',
    });
    expect(mockSignInWithOAuth).not.toHaveBeenCalled();
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});
