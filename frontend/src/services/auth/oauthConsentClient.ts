import { getApiBaseUrl } from '../../config/apiBase';
import { getSupabaseClient } from './supabaseClient';


export const SUPPORTED_OAUTH_SCOPES = new Set([
    'openid',
    'email',
    'profile',
    'phone',
    'offline_access',
]);


export interface OAuthAuthorizationClient {
    id: string;
    name: string;
    uri: string;
    logo_uri: string;
}


export interface OAuthAuthorizationDetails {
    authorization_id: string;
    redirect_uri: string;
    client: OAuthAuthorizationClient;
    user: { id: string; email: string };
    scope: string;
}


export interface OAuthRedirect {
    redirect_url: string;
}


interface OAuthResult<T> {
    data: T | null;
    error: { message: string } | null;
}


interface SupabaseOAuthConsentApi {
    getAuthorizationDetails(
        authorizationId: string,
    ): Promise<OAuthResult<OAuthAuthorizationDetails | OAuthRedirect>>;
    approveAuthorization(
        authorizationId: string,
        options?: { skipBrowserRedirect?: boolean },
    ): Promise<OAuthResult<OAuthRedirect>>;
    denyAuthorization(
        authorizationId: string,
        options?: { skipBrowserRedirect?: boolean },
    ): Promise<OAuthResult<OAuthRedirect>>;
}


export interface McpConsentCapability {
    capability_code: string;
    operation_mode: 'read' | 'write';
    risk_class: string;
    approval_policy: string;
    maximum_amount: string | null;
    currency_code: string | null;
    allow_sensitive_read: boolean;
}


export interface McpConsentProposal {
    proposal_fingerprint: string;
    subject: string;
    organization_id: string;
    organization_name: string;
    membership_id: string;
    agent_grant_id: string;
    client_id: string;
    client_display_name: string;
    branch_id: string | null;
    branch_name: string | null;
    consent_version: string;
    expires_at: string;
    capabilities: McpConsentCapability[];
}


export class OAuthConsentUnavailableError extends Error {
    constructor() {
        super(
            'OAuth consent is unavailable until @supabase/supabase-js 2.112.3 is installed and verified.',
        );
        this.name = 'OAuthConsentUnavailableError';
    }
}


export function getOAuthConsentApi(): SupabaseOAuthConsentApi {
    const auth = getSupabaseClient().auth as unknown as { oauth?: Partial<SupabaseOAuthConsentApi> };
    const oauth = auth.oauth;
    if (
        !oauth ||
        typeof oauth.getAuthorizationDetails !== 'function' ||
        typeof oauth.approveAuthorization !== 'function' ||
        typeof oauth.denyAuthorization !== 'function'
    ) {
        throw new OAuthConsentUnavailableError();
    }
    return oauth as SupabaseOAuthConsentApi;
}


export function parseStandardScopes(scope: string): string[] {
    const scopes = Array.from(new Set(scope.split(/\s+/).filter(Boolean)));
    if (!scopes.length || scopes.some((value) => !SUPPORTED_OAUTH_SCOPES.has(value))) {
        throw new Error('The authorization request contains an unsupported scope.');
    }
    return scopes;
}


export async function loadMcpConsentProposals(clientId?: string): Promise<McpConsentProposal[]> {
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session?.access_token) {
        throw new Error('A valid Supabase session is required.');
    }
    const response = await fetch(
        `${getApiBaseUrl()}/api/auth/oauth/mcp/connections`,
        { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    );
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = typeof body?.detail === 'string' ? body.detail : null;
        throw new Error(detail || 'The ERP grant proposal is unavailable.');
    }
    if (!Array.isArray(body) || body.some(row => !row || typeof row !== 'object'
        || typeof row.client_id !== 'string' || typeof row.subject !== 'string'
        || typeof row.organization_id !== 'string' || typeof row.organization_name !== 'string'
        || typeof row.agent_grant_id !== 'string' || typeof row.client_display_name !== 'string'
        || !/^[0-9a-f]{64}$/.test(row.proposal_fingerprint)
        || typeof row.expires_at !== 'string' || !Number.isFinite(Date.parse(row.expires_at))
        || !Array.isArray(row.capabilities) || !row.capabilities.length)) {
        throw new Error('The connection review response is incomplete.');
    }
    return body.filter(row => !clientId || row.client_id === clientId) as McpConsentProposal[];
}

export async function loadMcpConsentProposal(clientId: string): Promise<McpConsentProposal> {
    const matches = await loadMcpConsentProposals(clientId);
    if (matches.length !== 1) {
        throw new Error('Choose a reviewed organization and connection in ERP connection setup first.');
    }
    return matches[0] as McpConsentProposal;
}

export async function confirmMcpConsentProposal(proposal: McpConsentProposal): Promise<void> {
    if (!proposal.proposal_fingerprint) throw new Error('Review the current connection before confirming.');
    const { data, error } = await getSupabaseClient().auth.getSession();
    if (error || !data.session?.access_token) throw new Error('A valid Supabase session is required.');
    const response = await fetch(`${getApiBaseUrl()}/api/auth/oauth/mcp/connections`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: proposal.organization_id,
            agent_grant_id: proposal.agent_grant_id, client_id: proposal.client_id,
            proposal_fingerprint: proposal.proposal_fingerprint }),
    });
    if (!response.ok) throw new Error('The connection changed or is unavailable. Review it again.');
}


export function authorizationIdFromLocation(location: Location): string | null {
    if (location.pathname !== '/oauth/consent') return null;
    const value = new URLSearchParams(location.search).get('authorization_id')?.trim() || '';
    return /^[A-Za-z0-9_-]{16,512}$/.test(value) ? value : null;
}


const INVITATION_QUERY_KEYS = ['invitation_token', 'invite_token', 'invite'] as const;
const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9._~-]{8,2048}$/;


export function invitationTokenFromLocation(location: Location): string | null {
    const query = new URLSearchParams(location.search);
    for (const key of INVITATION_QUERY_KEYS) {
        const value = query.get(key)?.trim() || '';
        if (INVITATION_TOKEN_PATTERN.test(value)) return value;
    }
    if (location.pathname === '/accept-invitation') {
        const invitationLinkToken = query.get('token')?.trim() || '';
        if (INVITATION_TOKEN_PATTERN.test(invitationLinkToken)) return invitationLinkToken;
    }
    return null;
}


export function googleAuthReturnUrl(location: Location): string {
    const authorizationId = authorizationIdFromLocation(location);
    if (authorizationId) {
        const query = new URLSearchParams({ authorization_id: authorizationId });
        return `${location.origin}/oauth/consent?${query.toString()}`;
    }
    const invitationToken = invitationTokenFromLocation(location);
    if (!invitationToken) return location.origin;
    const query = new URLSearchParams({ invitation_token: invitationToken });
    return `${location.origin}/?${query.toString()}`;
}


export function redirectToOAuthClient(redirectUrl: string): void {
    window.location.assign(redirectUrl);
}
