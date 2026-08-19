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

jest.mock('../../services/offline/modules/sales', () => ({
    salesSyncService: {
        stop: jest.fn(),
        performInitialSync: jest.fn(() => Promise.resolve()),
    },
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
        }),
    ));
    expect(currentAuth.isAuthenticated).toBe(true);
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
