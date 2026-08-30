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


test('matches backend field limits and focuses a rejected organization field', async () => {
    mockCreateOrganization.mockResolvedValue({
        success: false,
        error: 'Check the highlighted organization details.',
        fieldErrors: {
            address_line1: 'Enter an address with at least 5 characters.',
        },
    });
    const user = userEvent.setup();
    render(<OrganizationOnboarding />);

    const form = screen.getByRole('form', { name: 'Create organization' });
    expect(within(form).getByLabelText('Legal name')).toHaveAttribute('minlength', '2');
    expect(within(form).getByLabelText('Address line 1')).toHaveAttribute('minlength', '5');
    expect(within(form).getByLabelText('Address line 1')).toHaveAttribute('maxlength', '240');
    expect(within(form).getByLabelText('City')).toHaveAttribute('minlength', '2');
    expect(within(form).getByLabelText('Postal code')).toHaveAttribute('pattern', '[1-9][0-9]{5}');

    await user.type(within(form).getByLabelText('Legal name'), 'Acme Pharma');
    await user.type(within(form).getByLabelText('Address line 1'), '42 Market Road');
    await user.type(within(form).getByLabelText('City'), 'Mumbai');
    await user.type(within(form).getByLabelText('GST state code'), '27');
    await user.type(within(form).getByLabelText('Postal code'), '400001');
    await user.click(within(form).getByRole('button', { name: 'Create organization' }));

    expect(await screen.findByText('Enter an address with at least 5 characters.')).toBeInTheDocument();
    expect(within(form).getByLabelText('Address line 1')).toHaveAttribute('aria-invalid', 'true');
    expect(within(form).getByLabelText('Address line 1')).toHaveFocus();
});


test('preselects join and accepts an invitation token from the query URL', async () => {
    window.history.replaceState({}, '', '/?invite=invite_abc12345');
    const user = userEvent.setup();
    render(<OrganizationOnboarding />);

    const joinChoice = screen.getByRole('button', { name: 'Join with invitation' });
    expect(joinChoice).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Organization invitation detected')).toBeInTheDocument();
    expect(screen.queryByLabelText('Invitation token')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Accept invitation and join' }));

    expect(mockAcceptInvitation).toHaveBeenCalledWith('invite_abc12345');
});


test('offers both onboarding paths and a safe account switch', () => {
    render(<OrganizationOnboarding />);

    expect(screen.getByRole('heading', { name: 'Set up your workspace' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Organization details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create new organization' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join with invitation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out and use another Google account' })).toBeInTheDocument();
});
