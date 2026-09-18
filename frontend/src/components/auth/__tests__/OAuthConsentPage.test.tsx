import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OAuthConsentPage from '../OAuthConsentPage';
import { getOAuthConsentApi, loadMcpConsentProposals, confirmMcpConsentProposal,
    redirectToOAuthClient } from '../../../services/auth/oauthConsentClient';

jest.mock('../../../services/auth/oauthConsentClient', () => ({
    authorizationIdFromLocation: () => 'authorization_123456789',
    getOAuthConsentApi: jest.fn(), loadMcpConsentProposals: jest.fn(),
    confirmMcpConsentProposal: jest.fn(),
    parseStandardScopes: (scope: string) => scope.split(' '), redirectToOAuthClient: jest.fn(),
}));
const details = { authorization_id: 'authorization_123456789',
    client: { id: 'client-1', name: 'Reviewed Assistant' },
    user: { id: 'subject-1', email: 'operator@example.com' }, scope: 'openid email offline_access' };
const proposal = { subject: details.user.id, organization_id: 'org-1', organization_name: 'AASO Test',
    agent_grant_id: 'grant-1', client_id: details.client.id, client_display_name: details.client.name,
    proposal_fingerprint: 'a'.repeat(64), branch_id: null, branch_name: null,
    consent_version: 'v1', expires_at: '2099-08-20T00:00:00Z', capabilities: [{
        capability_code: 'sales.invoice.create', operation_mode: 'write', risk_class: 'consequential_write',
        approval_policy: 'actor_confirmation', maximum_amount: '100.000000', currency_code: 'INR', allow_sensitive_read: true,
    }] };
const approve = jest.fn();
const deny = jest.fn();
const authorization = jest.fn();
beforeEach(() => {
    jest.clearAllMocks();
    (getOAuthConsentApi as jest.Mock).mockReturnValue({ getAuthorizationDetails: authorization,
        approveAuthorization: approve, denyAuthorization: deny });
    authorization.mockResolvedValue({ data: details, error: null });
    (loadMcpConsentProposals as jest.Mock).mockResolvedValue([proposal]);
    (confirmMcpConsentProposal as jest.Mock).mockResolvedValue(undefined);
    approve.mockResolvedValue({ data: { redirect_url: 'https://chat.example/callback' }, error: null });
    deny.mockResolvedValue({ data: { redirect_url: 'https://chat.example/denied' }, error: null });
});
async function choose(grant = 'grant-1') {
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: grant } });
}
test('explicit selection discloses complete access before confirmation', async () => {
    render(<OAuthConsentPage />);
    await screen.findByRole('combobox');
    expect(screen.queryByRole('button', { name: /Confirm this/ })).toBeNull();
    await choose();
    expect(screen.getByText(/All authorized branches/)).toBeTruthy();
    expect(screen.getByText(/Includes sensitive records/)).toBeTruthy();
    expect(screen.getByText(/limit INR 100.00/)).toBeTruthy();
    expect(screen.getByText(/Stay connected/)).toBeTruthy();
    expect(confirmMcpConsentProposal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Confirm this/ }));
    await waitFor(() => expect(approve).toHaveBeenCalled());
    expect(confirmMcpConsentProposal).toHaveBeenCalledWith(proposal);
    expect(redirectToOAuthClient).toHaveBeenCalledWith('https://chat.example/callback');
});
test('multiple organizations allow explicitly selecting second grant', async () => {
    const second = { ...proposal, organization_id: 'org-2', organization_name: 'Other Test', agent_grant_id: 'grant-2' };
    (loadMcpConsentProposals as jest.Mock).mockResolvedValue([proposal, second]);
    render(<OAuthConsentPage />);
    await choose('grant-2');
    fireEvent.click(screen.getByRole('button', { name: /Confirm this/ }));
    await waitFor(() => expect(confirmMcpConsentProposal).toHaveBeenCalledWith(second));
});
test('redirect-only authorization never offers an unbound two-client consent picker', async () => {
    authorization.mockResolvedValue({ data: { redirect_url: 'https://chat.example/existing' }, error: null });
    (loadMcpConsentProposals as jest.Mock).mockResolvedValue([proposal, { ...proposal, client_id: 'second-client' }]);
    render(<OAuthConsentPage />);
    const resume = await screen.findByRole('button', { name: 'Continue existing connection' });
    expect(redirectToOAuthClient).not.toHaveBeenCalled();
    expect(loadMcpConsentProposals).not.toHaveBeenCalled();
    expect(confirmMcpConsentProposal).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(resume);
    await waitFor(() => expect(redirectToOAuthClient).toHaveBeenCalledWith('https://chat.example/existing'));
    expect(approve).not.toHaveBeenCalled();
});

test('confirmation and denial are mutually exclusive while a request is pending', async () => {
    let resolveConfirmation!: () => void;
    (confirmMcpConsentProposal as jest.Mock).mockReturnValue(new Promise<void>(resolve => { resolveConfirmation = resolve; }));
    render(<OAuthConsentPage />);
    await choose();
    fireEvent.click(screen.getByRole('button', { name: /Confirm this/ }));
    expect((screen.getByRole('button', { name: 'Deny' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect(deny).not.toHaveBeenCalled();
    resolveConfirmation();
    await waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
});

test('pending denial prevents receipt confirmation and late approval', async () => {
    let resolveDenial!: (result: unknown) => void;
    deny.mockReturnValue(new Promise(resolve => { resolveDenial = resolve; }));
    render(<OAuthConsentPage />);
    await choose();
    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));
    expect((screen.getByRole('button', { name: /Confirm this/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Confirm this/ }));
    expect(confirmMcpConsentProposal).not.toHaveBeenCalled();
    resolveDenial({ data: { redirect_url: 'https://chat.example/denied' }, error: null });
    await waitFor(() => expect(redirectToOAuthClient).toHaveBeenCalledWith('https://chat.example/denied'));
    expect(approve).not.toHaveBeenCalled();
});
test('missing reviewed grant never claims success', async () => {
    (loadMcpConsentProposals as jest.Mock).mockResolvedValue([]);
    render(<OAuthConsentPage />);
    expect(await screen.findByText(/No reviewed connection grant/)).toBeTruthy();
    expect(confirmMcpConsentProposal).not.toHaveBeenCalled();
});
test.each([{ client_id: 'other' }, { subject: 'other' }])('rejects mismatched proposal %j', async change => {
    (loadMcpConsentProposals as jest.Mock).mockResolvedValue([{ ...proposal, ...change }]);
    render(<OAuthConsentPage />);
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
});
test('failed receipt confirmation cannot approve identity or redirect', async () => {
    (confirmMcpConsentProposal as jest.Mock).mockRejectedValue(new Error('Review again'));
    render(<OAuthConsentPage />);
    await choose();
    fireEvent.click(screen.getByRole('button', { name: /Confirm this/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Review again');
    expect(approve).not.toHaveBeenCalled();
    expect(redirectToOAuthClient).not.toHaveBeenCalled();
});
test('deny never confirms organization access', async () => {
    render(<OAuthConsentPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));
    await waitFor(() => expect(redirectToOAuthClient).toHaveBeenCalledWith('https://chat.example/denied'));
    expect(confirmMcpConsentProposal).not.toHaveBeenCalled();
});
