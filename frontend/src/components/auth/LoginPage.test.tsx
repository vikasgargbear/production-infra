import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import LoginPage from './LoginPage';


const mockLoginWithGoogle = jest.fn();
const mockCreateOrganization = jest.fn();
const mockAcceptInvitation = jest.fn();
let mockAuthState: Record<string, unknown>;


jest.mock('../../contexts/AuthContext', () => ({
    useAuth: () => mockAuthState,
}));


beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState({}, '', '/');
    mockAuthState = {
        acceptInvitation: mockAcceptInvitation,
        createOrganization: mockCreateOrganization,
        hasCloudSession: false,
        isOnline: true,
        loginWithGoogle: mockLoginWithGoogle,
        logout: jest.fn(),
        onboardingRequired: false,
        retrySessionExchange: jest.fn(),
        sessionExchangeError: null,
    };
});


test('presents Google as the create-or-join path before authentication', async () => {
    const user = userEvent.setup();
    mockLoginWithGoogle.mockResolvedValue(undefined);
    render(<LoginPage />);

    expect(screen.getByText('Continue with Google to create or join an organization')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(mockLoginWithGoogle).toHaveBeenCalledTimes(1);
});


test('does not present unsupported email or password authentication', () => {
    render(<LoginPage />);

    expect(screen.queryByLabelText(/email address/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email and password/i)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toHaveAttribute(
        'aria-describedby',
        'google-sign-in-guidance',
    );
});


test('shows both onboarding choices for a Google user without ERP membership', () => {
    mockAuthState = {
        ...mockAuthState,
        hasCloudSession: true,
        onboardingRequired: true,
        sessionExchangeError: 'Create an organization or accept an invitation.',
    };
    render(<LoginPage />);

    expect(screen.getByText('Create or join your organization')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create new organization' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Join with invitation' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry ERP connection' })).not.toBeInTheDocument();
    expect(screen.getByTestId('login-panel')).toHaveClass('max-w-4xl');
});
