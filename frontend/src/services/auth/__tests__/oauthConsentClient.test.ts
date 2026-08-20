import {
    OAuthConsentUnavailableError,
    authorizationIdFromLocation,
    getOAuthConsentApi,
    googleAuthReturnUrl,
    loadMcpConsentProposal,
    parseStandardScopes,
} from '../oauthConsentClient';


const mockGetSession = jest.fn();
const mockClient: any = { auth: { getSession: mockGetSession } };


jest.mock('../supabaseClient', () => ({
    getSupabaseClient: () => mockClient,
}));


beforeEach(() => {
    jest.clearAllMocks();
    mockClient.auth = { getSession: mockGetSession };
});


test('accepts only unique standard OAuth and OIDC scopes', () => {
    expect(parseStandardScopes('openid email profile email offline_access')).toEqual([
        'openid',
        'email',
        'profile',
        'offline_access',
    ]);
    expect(() => parseStandardScopes('openid erp.invoice.write')).toThrow('unsupported scope');
    expect(() => parseStandardScopes('')).toThrow('unsupported scope');
});


test('fails closed when the installed Supabase SDK has no consent API', () => {
    expect(() => getOAuthConsentApi()).toThrow(OAuthConsentUnavailableError);
});


test('uses only the official Supabase OAuth consent methods when available', () => {
    const oauth = {
        getAuthorizationDetails: jest.fn(),
        approveAuthorization: jest.fn(),
        denyAuthorization: jest.fn(),
    };
    mockClient.auth.oauth = oauth;
    expect(getOAuthConsentApi()).toBe(oauth);
});


test('preserves only a valid consent authorization id for Google login', () => {
    const consentLocation = {
        origin: 'https://erp.example.com',
        pathname: '/oauth/consent',
        search: '?authorization_id=authorization_123456789&untrusted=value',
    } as Location;
    expect(authorizationIdFromLocation(consentLocation)).toBe('authorization_123456789');
    expect(googleAuthReturnUrl(consentLocation)).toBe(
        'https://erp.example.com/oauth/consent?authorization_id=authorization_123456789',
    );

    const unrelated = {
        origin: 'https://erp.example.com',
        pathname: '/sales',
        search: '?authorization_id=authorization_123456789',
    } as Location;
    expect(authorizationIdFromLocation(unrelated)).toBeNull();
    expect(googleAuthReturnUrl(unrelated)).toBe('https://erp.example.com');
});


test('loads the ERP proposal with the persisted user session bearer', async () => {
    mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'supabase-user-token' } },
        error: null,
    });
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ client_id: 'client-1' }),
    });

    await expect(loadMcpConsentProposal('client-1')).resolves.toEqual({ client_id: 'client-1' });
    expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/oauth/mcp/consent-proposal?client_id=client-1'),
        { headers: { Authorization: 'Bearer supabase-user-token' } },
    );
});
