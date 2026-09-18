import {
    OAuthConsentUnavailableError,
    authorizationIdFromLocation,
    getOAuthConsentApi,
    googleAuthReturnUrl,
    invitationTokenFromLocation,
    loadMcpConsentProposal,
    parseStandardScopes,
} from '../oauthConsentClient';
import { createClient } from '@supabase/supabase-js';


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


test('installed Supabase SDK exposes the official OAuth consent methods', () => {
    const client = createClient(
        'https://sdk-contract.supabase.co',
        'contract-only-anon-key',
        { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const oauth = client.auth.oauth;

    expect(typeof oauth.getAuthorizationDetails).toBe('function');
    expect(typeof oauth.approveAuthorization).toBe('function');
    expect(typeof oauth.denyAuthorization).toBe('function');
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


test('preserves only a supported organization invitation token for Google login', () => {
    const invited = {
        origin: 'https://erp.example.com',
        pathname: '/',
        search: '?invite_token=invite_abc12345&untrusted=value',
    } as Location;
    expect(invitationTokenFromLocation(invited)).toBe('invite_abc12345');
    expect(googleAuthReturnUrl(invited)).toBe(
        'https://erp.example.com/?invitation_token=invite_abc12345',
    );

    const backendInvitationLink = {
        origin: 'https://erp.example.com',
        pathname: '/accept-invitation',
        search: '?token=opaque_invitation_123456789',
    } as Location;
    expect(invitationTokenFromLocation(backendInvitationLink)).toBe('opaque_invitation_123456789');
    expect(googleAuthReturnUrl(backendInvitationLink)).toBe(
        'https://erp.example.com/?invitation_token=opaque_invitation_123456789',
    );

    const invalid = {
        origin: 'https://erp.example.com',
        pathname: '/',
        search: '?invitation_token=%3Cscript%3E',
    } as Location;
    expect(invitationTokenFromLocation(invalid)).toBeNull();
    expect(googleAuthReturnUrl(invalid)).toBe('https://erp.example.com');
});


test('loads the ERP proposal with the persisted user session bearer', async () => {
    const proposal = { client_id: 'client-1', subject: 'subject-1', organization_id: 'org-1',
        organization_name: 'Test org', agent_grant_id: 'grant-1', client_display_name: 'Assistant',
        proposal_fingerprint: 'a'.repeat(64), expires_at: '2099-01-01T00:00:00Z', consent_version: 'v1',
        capabilities: [{ capability_code: 'products.search', operation_mode: 'read', risk_class: 'read_only',
            approval_policy: 'none', maximum_amount: null, currency_code: null, allow_sensitive_read: false }] };
    mockGetSession.mockResolvedValue({
        data: { session: { access_token: 'supabase-user-token' } },
        error: null,
    });
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => [proposal],
    });

    await expect(loadMcpConsentProposal('client-1')).resolves.toEqual(proposal);
    expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/auth/oauth/mcp/connections'),
        { headers: { Authorization: 'Bearer supabase-user-token' } },
    );
});
