import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import OAuthConsentPage from '../OAuthConsentPage';
import {
    getOAuthConsentApi,
    loadMcpConsentProposal,
    redirectToOAuthClient,
} from '../../../services/auth/oauthConsentClient';


jest.mock('../../../services/auth/oauthConsentClient', () => ({
    authorizationIdFromLocation: () => 'authorization_123456789',
    getOAuthConsentApi: jest.fn(),
    loadMcpConsentProposal: jest.fn(),
    parseStandardScopes: (scope: string) => scope.split(' '),
    redirectToOAuthClient: jest.fn(),
}));


const details = {
    authorization_id: 'authorization_123456789',
    redirect_uri: 'https://chat.example.com/callback',
    client: {
        id: 'client-1',
        name: 'Reviewed Assistant',
        uri: 'https://chat.example.com',
        logo_uri: '',
    },
    user: { id: '11111111-1111-1111-1111-111111111111', email: 'operator@example.com' },
    scope: 'openid email offline_access',
};


const proposal = {
    subject: details.user.id,
    organization_id: '22222222-2222-2222-2222-222222222222',
    organization_name: 'AASO Pharma',
    membership_id: '33333333-3333-3333-3333-333333333333',
    agent_grant_id: '44444444-4444-4444-4444-444444444444',
    client_id: details.client.id,
    client_display_name: details.client.name,
    branch_id: null,
    branch_name: null,
    consent_version: 'v1',
    expires_at: '2099-08-20T00:00:00Z',
    capabilities: [{
        capability_code: 'master.products.search',
        operation_mode: 'read',
        risk_class: 'read_only',
        approval_policy: 'none',
        maximum_amount: null,
        currency_code: null,
        allow_sensitive_read: false,
    }],
};


const approveAuthorization = jest.fn();
const denyAuthorization = jest.fn();


beforeEach(() => {
    jest.clearAllMocks();
    (getOAuthConsentApi as jest.Mock).mockReturnValue({
        getAuthorizationDetails: jest.fn().mockResolvedValue({ data: details, error: null }),
        approveAuthorization,
        denyAuthorization,
    });
    (loadMcpConsentProposal as jest.Mock).mockResolvedValue(proposal);
    approveAuthorization.mockResolvedValue({
        data: { redirect_url: 'https://chat.example.com/callback?code=code&state=state' },
        error: null,
    });
    denyAuthorization.mockResolvedValue({
        data: { redirect_url: 'https://chat.example.com/callback?error=access_denied' },
        error: null,
    });
});


test('shows exact client, standard scopes, ERP tenant and capabilities', async () => {
    render(<OAuthConsentPage />);

    expect(await screen.findByRole('heading', { name: 'Authorize Reviewed Assistant' })).toBeTruthy();
    expect(screen.getByText('AASO Pharma')).toBeTruthy();
    expect(screen.getByText('All authorized branches')).toBeTruthy();
    expect(screen.getByText('Verify your identity')).toBeTruthy();
    expect(screen.getByText('Stay connected when you are away')).toBeTruthy();
    expect(screen.getByText('master.products.search')).toBeTruthy();
});


test('resumes an existing authorization through the returned OAuth redirect', async () => {
    const redirectUrl = 'https://chat.example.com/callback?code=existing&state=state';
    (getOAuthConsentApi as jest.Mock).mockReturnValue({
        getAuthorizationDetails: jest.fn().mockResolvedValue({
            data: { redirect_url: redirectUrl },
            error: null,
        }),
        approveAuthorization,
        denyAuthorization,
    });

    render(<OAuthConsentPage />);

    await waitFor(() => expect(redirectToOAuthClient).toHaveBeenCalledWith(redirectUrl));
    expect(loadMcpConsentProposal).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Authorization unavailable' })).toBeNull();
});


test('requires an explicit click and revalidates the proposal before approval', async () => {
    render(<OAuthConsentPage />);
    await screen.findByRole('button', { name: 'Approve' });
    expect(approveAuthorization).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

    await waitFor(() => expect(approveAuthorization).toHaveBeenCalledWith(
        details.authorization_id,
        { skipBrowserRedirect: true },
    ));
    expect(loadMcpConsentProposal).toHaveBeenCalledTimes(2);
    expect(redirectToOAuthClient).toHaveBeenCalledWith(
        'https://chat.example.com/callback?code=code&state=state',
    );
});


test('denies through the official SDK without approving or reloading the grant', async () => {
    render(<OAuthConsentPage />);
    await screen.findByRole('button', { name: 'Deny' });

    fireEvent.click(screen.getByRole('button', { name: 'Deny' }));

    await waitFor(() => expect(denyAuthorization).toHaveBeenCalledWith(
        details.authorization_id,
        { skipBrowserRedirect: true },
    ));
    expect(approveAuthorization).not.toHaveBeenCalled();
    expect(loadMcpConsentProposal).toHaveBeenCalledTimes(1);
    expect(redirectToOAuthClient).toHaveBeenCalledWith(
        'https://chat.example.com/callback?error=access_denied',
    );
});


test('fails closed when the canonical proposal belongs to another client', async () => {
    (loadMcpConsentProposal as jest.Mock).mockResolvedValue({
        ...proposal,
        client_id: 'wrong-client',
    });
    render(<OAuthConsentPage />);

    expect(await screen.findByRole('heading', { name: 'Authorization unavailable' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('different OAuth client');
    expect(approveAuthorization).not.toHaveBeenCalled();
});
