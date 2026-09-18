import React, { useEffect, useState } from 'react';
import { authorizationIdFromLocation, getOAuthConsentApi, OAuthAuthorizationDetails,
    parseStandardScopes, redirectToOAuthClient } from '../../services/auth/oauthConsentClient';
import McpConnectionsPanel from './McpConnectionsPanel';

const SCOPE_LABELS: Record<string, string> = {
    openid: 'Verify your identity', email: 'View your email address',
    profile: 'View your basic profile', phone: 'View your phone number',
    offline_access: 'Stay connected when you are away',
};

function OAuthAuthorizationConsent() {
    const authorizationId = authorizationIdFromLocation(window.location);
    const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
    const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [scopes, setScopes] = useState<string[]>([]);
    const [denying, setDenying] = useState(false);
    useEffect(() => {
        let active = true;
        const load = async () => {
            if (!authorizationId) throw new Error('The authorization request is missing or invalid.');
            const result = await getOAuthConsentApi().getAuthorizationDetails(authorizationId);
            if (result.error || !result.data) throw new Error('The authorization request is unavailable.');
            if (!active) return;
            if (!('authorization_id' in result.data)) {
                if (!result.data.redirect_url) throw new Error('The authorization response has no return address.');
                // Do not infer a client from this URL or skip ERP consent.
                setPendingRedirect(result.data.redirect_url);
            } else {
                if (result.data.authorization_id !== authorizationId) throw new Error('Authorization request mismatch.');
                setScopes(parseStandardScopes(result.data.scope));
                setDetails(result.data);
            }
        };
        void load().catch(reason => { if (active) setError(reason.message); });
        return () => { active = false; };
    }, [authorizationId]);
    const complete = async () => {
        if (pendingRedirect) { redirectToOAuthClient(pendingRedirect); return; }
        if (!authorizationId || !details) throw new Error('Review this authorization again.');
        const result = await getOAuthConsentApi().approveAuthorization(authorizationId, { skipBrowserRedirect: true });
        if (result.error || !result.data?.redirect_url) throw new Error('Identity authorization could not complete. Please retry.');
        redirectToOAuthClient(result.data.redirect_url);
    };
    const deny = async () => {
        if (!authorizationId || denying) return;
        setDenying(true);
        try {
            const result = await getOAuthConsentApi().denyAuthorization(authorizationId, { skipBrowserRedirect: true });
            if (result.error || !result.data?.redirect_url) throw new Error('Unable to close authorization.');
            redirectToOAuthClient(result.data.redirect_url);
        } catch (reason) { setError(reason instanceof Error ? reason.message : 'Authorization unavailable.'); }
        finally { setDenying(false); }
    };
    return <main className="min-h-screen bg-gray-50 p-4">
        {error && <p role="alert" className="mx-auto max-w-2xl text-red-700">{error}</p>}
        {!details && !pendingRedirect && !error && <p role="status">Loading authorization request…</p>}
        {details && <header className="mx-auto max-w-2xl p-6 space-y-2">
            <h1 className="text-xl font-semibold">Authorize {details.client.name}</h1>
            <p>Signed in as {details.user.email}</p>
            <h2>Identity access</h2>
            <ul>{scopes.map(scope => <li key={scope}>{SCOPE_LABELS[scope]}</li>)}</ul>
        </header>}
        {(details || pendingRedirect) && <>
            <McpConnectionsPanel clientId={details?.client.id} subjectId={details?.user.id}
                clientName={details?.client.name} onConfirmed={complete} />
            <div className="mx-auto max-w-2xl px-6"><button type="button" disabled={denying}
                className="min-h-11 border rounded px-4" onClick={() => void deny()}>Deny</button></div>
        </>}
    </main>;
}

export default function OAuthConsentPage() {
    return new URLSearchParams(window.location.search).get('connection_setup') === '1'
        ? <McpConnectionsPanel /> : <OAuthAuthorizationConsent />;
}
