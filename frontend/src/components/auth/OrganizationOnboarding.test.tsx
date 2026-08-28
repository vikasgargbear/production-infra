import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import OrganizationOnboarding from './OrganizationOnboarding';


const mockCreateOrganization = jest.fn();
const mockAcceptInvitation = jest.fn();
const mockLogout = jest.fn();


jest.mock('../../contexts/AuthContext', () => ({
    useAuth: () => ({
        acceptInvitation: mockAcceptInvitation,
        createOrganization: mockCreateOrganization,
        isOnline: true,
        logout: mockLogout,
    }),
}));


beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/');
    mockCreateOrganization.mockResolvedValue({ success: true });
    mockAcceptInvitation.mockResolvedValue({ success: true });
});


test('creates an organization with accessible canonical business fields', async () => {
    const user = userEvent.setup();
    render(<OrganizationOnboarding />);

    const form = screen.getByRole('form', { name: 'Create organization' });
    await user.type(within(form).getByLabelText('Legal name'), ' Acme Pharma Private Limited ');
    await user.type(within(form).getByLabelText(/Trade name/), ' Acme Pharma ');
    await user.type(within(form).getByLabelText('Address line 1'), ' 42 Market Road ');
    await user.type(within(form).getByLabelText('City'), ' Mumbai ');
    await user.type(within(form).getByLabelText('GST state code'), '27');
    await user.type(within(form).getByLabelText('Postal code'), '400001');
    await user.click(within(form).getByRole('button', { name: 'Create organization' }));

    expect(mockCreateOrganization).toHaveBeenCalledWith({
        legal_name: 'Acme Pharma Private Limited',
        trade_name: 'Acme Pharma',
        address_line1: '42 Market Road',
        city: 'Mumbai',
        state_code: '27',
        postal_code: '400001',
    });
});


test('preselects join and accepts an invitation token from the query URL', async () => {
    window.history.replaceState({}, '', '/?invite=invite_abc12345');
    const user = userEvent.setup();
    render(<OrganizationOnboarding />);

    const joinChoice = screen.getByRole('button', { name: 'Join with invitation' });
    expect(joinChoice).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Invitation token')).toHaveValue('invite_abc12345');

    await user.click(screen.getByRole('button', { name: 'Accept invitation and join' }));

    expect(mockAcceptInvitation).toHaveBeenCalledWith('invite_abc12345');
});


test('offers both onboarding paths and a safe account switch', () => {
    render(<OrganizationOnboarding />);

    expect(screen.getByRole('heading', { name: 'Choose how to continue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create new organization' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join with invitation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out and use another Google account' })).toBeInTheDocument();
});
