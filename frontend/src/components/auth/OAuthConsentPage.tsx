import React, { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle,
    Building2,
    Check,
    ExternalLink,
    Loader2,
    MapPin,
    ShieldCheck,
    X,
} from 'lucide-react';
import {
    McpConsentProposal,
    OAuthAuthorizationDetails,
    authorizationIdFromLocation,
    getOAuthConsentApi,
    loadMcpConsentProposal,
    parseStandardScopes,
    redirectToOAuthClient,
} from '../../services/auth/oauthConsentClient';


interface ConsentState {
    details: OAuthAuthorizationDetails;
    proposal: McpConsentProposal;
    scopes: string[];
}


const SCOPE_LABELS: Record<string, string> = {
    openid: 'Verify your identity',
    email: 'View your email address',
    profile: 'View your basic profile',
    phone: 'View your phone number',
    offline_access: 'Stay connected when you are away',
};


function validateProposal(
    details: OAuthAuthorizationDetails,
    proposal: McpConsentProposal,
): void {
    if (proposal.client_id !== details.client.id) {
        throw new Error('The ERP grant belongs to a different OAuth client.');
    }
    if (proposal.client_display_name !== details.client.name) {
        throw new Error('The registered client identity does not match the ERP grant.');
    }
    if (proposal.subject !== details.user.id) {
        throw new Error('The ERP grant belongs to a different signed-in user.');
    }
    if (!proposal.capabilities.length || new Date(proposal.expires_at).getTime() <= Date.now()) {
        throw new Error('The ERP grant is empty or expired.');
    }
}


const OAuthConsentPage: React.FC = () => {
    const [consent, setConsent] = useState<ConsentState | null>(null);
    const [error, setError] = useState('');
    const [decision, setDecision] = useState<'approve' | 'deny' | null>(null);
    const authorizationId = authorizationIdFromLocation(window.location);

    const load = useCallback(async () => {
        if (!authorizationId) {
            setError('The authorization request is missing or invalid.');
            return;
        }
        try {
            const api = getOAuthConsentApi();
            const { data, error: authError } = await api.getAuthorizationDetails(authorizationId);
            if (authError || !data) {
                throw new Error(authError?.message || 'The authorization request is invalid.');
            }
            if (!('authorization_id' in data)) {
                throw new Error(
                    'This request was already authorized. Revoke the existing authorization before reconnecting.',
                );
            }
            if (data.authorization_id !== authorizationId) {
                throw new Error('The authorization response does not match this request.');
            }
            const scopes = parseStandardScopes(data.scope);
            const proposal = await loadMcpConsentProposal(data.client.id);
            validateProposal(data, proposal);
            setConsent({ details: data, proposal, scopes });
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'Authorization is unavailable.');
        }
    }, [authorizationId]);

    useEffect(() => {
        void load();
    }, [load]);

    const decide = async (nextDecision: 'approve' | 'deny') => {
        if (!authorizationId || !consent || decision) return;
        setDecision(nextDecision);
        setError('');
        try {
            if (nextDecision === 'approve') {
                const currentProposal = await loadMcpConsentProposal(consent.details.client.id);
                validateProposal(consent.details, currentProposal);
                if (currentProposal.agent_grant_id !== consent.proposal.agent_grant_id) {
                    throw new Error('The ERP grant changed while this request was open.');
                }
            }
            const api = getOAuthConsentApi();
            const result = nextDecision === 'approve'
                ? await api.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
                : await api.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
            if (result.error || !result.data?.redirect_url) {
                throw new Error(result.error?.message || 'Supabase did not return a redirect URL.');
            }
            redirectToOAuthClient(result.data.redirect_url);
        } catch (decisionError) {
            setError(decisionError instanceof Error ? decisionError.message : 'Authorization failed.');
            setDecision(null);
        }
    };

    if (error && !consent) {
        return (
            <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <section className="w-full max-w-lg bg-white border border-gray-200 rounded-lg shadow-sm p-6">
                    <AlertTriangle className="w-10 h-10 text-red-600 mb-4" aria-hidden="true" />
                    <h1 className="text-xl font-semibold text-gray-900">Authorization unavailable</h1>
                    <p className="mt-2 text-sm text-gray-700" role="alert">{error}</p>
                </section>
            </main>
        );
    }

    if (!consent) {
        return (
            <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="flex items-center gap-3 text-gray-700" role="status">
                    <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                    <span>Loading authorization request...</span>
                </div>
            </main>
        );
    }

    const { details, proposal, scopes } = consent;
    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6">
            <section className="w-full max-w-2xl bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <header className="px-6 py-5 border-b border-gray-200 flex items-start gap-4">
                    <div className="w-11 h-11 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center flex-shrink-0">
                        <ShieldCheck className="w-6 h-6" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-xl font-semibold text-gray-900">
                            Authorize {details.client.name}
                        </h1>
                        <a
                            href={details.client.uri}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-sm text-blue-700 hover:underline break-all"
                        >
                            {details.client.uri}
                            <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                        </a>
                        <div className="mt-1 text-xs text-gray-500 break-all">
                            Signed in as {details.user.email} / callback {details.redirect_uri}
                        </div>
                    </div>
                </header>

                <div className="px-6 py-5 space-y-6">
                    <div className="grid sm:grid-cols-2 gap-4">
                        <div className="flex items-start gap-3">
                            <Building2 className="w-5 h-5 text-gray-500 mt-0.5" aria-hidden="true" />
                            <div>
                                <div className="text-xs font-medium uppercase text-gray-500">Organization</div>
                                <div className="mt-1 text-sm font-medium text-gray-900">{proposal.organization_name}</div>
                            </div>
                        </div>
                        <div className="flex items-start gap-3">
                            <MapPin className="w-5 h-5 text-gray-500 mt-0.5" aria-hidden="true" />
                            <div>
                                <div className="text-xs font-medium uppercase text-gray-500">Business scope</div>
                                <div className="mt-1 text-sm font-medium text-gray-900">
                                    {proposal.branch_name || 'All authorized branches'}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">Identity access</h2>
                        <ul className="mt-3 divide-y divide-gray-100 border-y border-gray-100">
                            {scopes.map((scope) => (
                                <li key={scope} className="py-2.5 flex items-center gap-2 text-sm text-gray-700">
                                    <Check className="w-4 h-4 text-green-600 flex-shrink-0" aria-hidden="true" />
                                    {SCOPE_LABELS[scope]}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-sm font-semibold text-gray-900">ERP capabilities</h2>
                        <ul className="mt-3 divide-y divide-gray-100 border-y border-gray-100">
                            {proposal.capabilities.map((capability) => (
                                <li key={capability.capability_code} className="py-3 flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-gray-900 break-words">
                                            {capability.capability_code}
                                        </div>
                                        <div className="mt-0.5 text-xs text-gray-500">
                                            {capability.risk_class.replace(/_/g, ' ')} / {capability.approval_policy.replace(/_/g, ' ')}
                                        </div>
                                        {capability.maximum_amount !== null && capability.currency_code && (
                                            <div className="mt-0.5 text-xs text-gray-500">
                                                Limit {capability.currency_code} {capability.maximum_amount}
                                            </div>
                                        )}
                                        {capability.allow_sensitive_read && (
                                            <div className="mt-0.5 text-xs font-medium text-amber-700">
                                                Includes sensitive records
                                            </div>
                                        )}
                                    </div>
                                    <span className={`text-xs font-medium px-2 py-1 rounded ${capability.operation_mode === 'write' ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>
                                        {capability.operation_mode}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2" role="alert">
                            <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
                            <span className="text-sm text-red-800">{error}</span>
                        </div>
                    )}
                    <div className="text-xs text-gray-500">
                        Grant expires {new Date(proposal.expires_at).toLocaleString()}
                    </div>
                </div>

                <footer className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => void decide('deny')}
                        disabled={decision !== null}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-100 disabled:opacity-50"
                    >
                        {decision === 'deny' ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                        Deny
                    </button>
                    <button
                        type="button"
                        onClick={() => void decide('approve')}
                        disabled={decision !== null}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
                    >
                        {decision === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Approve
                    </button>
                </footer>
            </section>
        </main>
    );
};


export default OAuthConsentPage;
