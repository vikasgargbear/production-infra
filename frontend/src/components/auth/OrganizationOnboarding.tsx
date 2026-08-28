import React, { FormEvent, useEffect, useRef, useState } from 'react';
import { AlertCircle, Building2, Loader2, MailCheck } from 'lucide-react';
import { CreateOrganizationInput, useAuth } from '../../contexts/AuthContext';
import { invitationTokenFromLocation } from '../../services/auth/oauthConsentClient';


type OnboardingMode = 'create' | 'join';

const emptyOrganization: CreateOrganizationInput = {
    legal_name: '',
    trade_name: '',
    address_line1: '',
    city: '',
    state_code: '',
    postal_code: '',
};


const OrganizationOnboarding: React.FC = () => {
    const { acceptInvitation, createOrganization, isOnline, logout } = useAuth();
    const initialInvitationToken = invitationTokenFromLocation(window.location) || '';
    const [mode, setMode] = useState<OnboardingMode>(initialInvitationToken ? 'join' : 'create');
    const [organization, setOrganization] = useState<CreateOrganizationInput>(emptyOrganization);
    const [invitationToken, setInvitationToken] = useState(initialInvitationToken);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const errorRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (error) errorRef.current?.focus();
    }, [error]);

    const updateOrganization = (field: keyof CreateOrganizationInput, value: string) => {
        setOrganization((previous) => ({ ...previous, [field]: value }));
    };

    const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setLoading(true);
        try {
            const result = await createOrganization({
                legal_name: organization.legal_name.trim(),
                trade_name: organization.trade_name.trim(),
                address_line1: organization.address_line1.trim(),
                city: organization.city.trim(),
                state_code: organization.state_code.trim(),
                postal_code: organization.postal_code.trim(),
            });
            if (!result.success) {
                setError(result.error || 'The organization could not be created.');
            }
        } catch {
            setError('The organization could not be created.');
        } finally {
            setLoading(false);
        }
    };

    const handleAcceptInvitation = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setLoading(true);
        try {
            const result = await acceptInvitation(invitationToken);
            if (!result.success) {
                setError(result.error || 'The invitation could not be accepted.');
            }
        } catch {
            setError('The invitation could not be accepted.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <section aria-labelledby="organization-onboarding-heading" className="space-y-5">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
                <h2 id="organization-onboarding-heading" className="font-semibold">
                    Choose how to continue
                </h2>
                <p className="mt-1">
                    Your Google account is connected. Create a new organization or join one using an invitation.
                </p>
            </div>

            {error && (
                <div ref={errorRef} tabIndex={-1} role="alert" aria-live="assertive" className="flex items-start rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 outline-none focus:ring-2 focus:ring-red-500">
                    <AlertCircle aria-hidden="true" className="mr-2 mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2" aria-label="Organization setup options">
                <button
                    type="button"
                    aria-pressed={mode === 'create'}
                    onClick={() => { setMode('create'); setError(''); }}
                    disabled={loading}
                    className={`min-h-20 rounded-lg border p-3 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${mode === 'create' ? 'border-blue-600 bg-blue-50 text-blue-950' : 'border-gray-300 bg-white text-gray-800'}`}
                >
                    <Building2 aria-hidden="true" className="mb-1 h-5 w-5" />
                    <span className="block font-semibold">Create new organization</span>
                </button>
                <button
                    type="button"
                    aria-pressed={mode === 'join'}
                    onClick={() => { setMode('join'); setError(''); }}
                    disabled={loading}
                    className={`min-h-20 rounded-lg border p-3 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${mode === 'join' ? 'border-blue-600 bg-blue-50 text-blue-950' : 'border-gray-300 bg-white text-gray-800'}`}
                >
                    <MailCheck aria-hidden="true" className="mb-1 h-5 w-5" />
                    <span className="block font-semibold">Join with invitation</span>
                </button>
            </div>

            {mode === 'create' ? (
                <form onSubmit={handleCreate} className="space-y-4" aria-label="Create organization">
                    <div>
                        <label htmlFor="organization-legal-name" className="mb-1 block text-sm font-medium text-gray-800">
                            Legal name
                        </label>
                        <input
                            id="organization-legal-name"
                            value={organization.legal_name}
                            onChange={(event) => updateOrganization('legal_name', event.target.value)}
                            autoComplete="organization"
                            maxLength={200}
                            required
                            disabled={loading}
                            className="min-h-12 w-full rounded-md border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="organization-trade-name" className="mb-1 block text-sm font-medium text-gray-800">
                            Trade name <span className="font-normal text-gray-500">(optional)</span>
                        </label>
                        <input
                            id="organization-trade-name"
                            value={organization.trade_name}
                            onChange={(event) => updateOrganization('trade_name', event.target.value)}
                            maxLength={200}
                            disabled={loading}
                            className="min-h-12 w-full rounded-md border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="organization-address-line1" className="mb-1 block text-sm font-medium text-gray-800">
                            Address line 1
                        </label>
                        <input
                            id="organization-address-line1"
                            value={organization.address_line1}
                            onChange={(event) => updateOrganization('address_line1', event.target.value)}
                            autoComplete="address-line1"
                            maxLength={250}
                            required
                            disabled={loading}
                            className="min-h-12 w-full rounded-md border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="organization-city" className="mb-1 block text-sm font-medium text-gray-800">
                            City
                        </label>
                        <input
                            id="organization-city"
                            value={organization.city}
                            onChange={(event) => updateOrganization('city', event.target.value)}
                            autoComplete="address-level2"
                            maxLength={120}
                            required
                            disabled={loading}
                            className="min-h-12 w-full rounded-md border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
                        <div>
                            <label htmlFor="organization-state-code" className="mb-1 block text-sm font-medium text-gray-800">
                                GST state code
                            </label>
                            <input
                                id="organization-state-code"
                                value={organization.state_code}
                                onChange={(event) => updateOrganization('state_code', event.target.value)}
                                inputMode="numeric"
                                pattern="[0-9]{2}"
                                maxLength={2}
                                title="Enter the 2-digit Indian GST state code"
                                aria-describedby="organization-state-code-help"
                                required
                                disabled={loading}
                                className="min-h-12 w-full rounded-md border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p id="organization-state-code-help" className="mt-1 text-xs text-gray-500">2 digits, for example 27</p>
                        </div>
                        <div>
                            <label htmlFor="organization-postal-code" className="mb-1 block text-sm font-medium text-gray-800">
                                Postal code
                            </label>
                            <input
                                id="organization-postal-code"
                                value={organization.postal_code}
                                onChange={(event) => updateOrganization('postal_code', event.target.value)}
                                autoComplete="postal-code"
                                inputMode="numeric"
                                pattern="[0-9]{6}"
                                maxLength={6}
                                title="Enter a 6-digit Indian postal code"
                                aria-describedby="organization-postal-code-help"
                                required
                                disabled={loading}
                                className="min-h-12 w-full rounded-md border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p id="organization-postal-code-help" className="mt-1 text-xs text-gray-500">6-digit PIN code</p>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading || !isOnline}
                        className="flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading && <Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" />}
                        {loading ? 'Creating organization...' : 'Create organization'}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleAcceptInvitation} className="space-y-4" aria-label="Join with invitation">
                    {initialInvitationToken ? (
                        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-950">
                            <p className="font-semibold">Organization invitation detected</p>
                            <p className="mt-1">Continue to join with the Google account that received this invitation.</p>
                        </div>
                    ) : (
                        <div>
                            <label htmlFor="organization-invitation-token" className="mb-1 block text-sm font-medium text-gray-800">
                                Invitation token
                            </label>
                            <input
                                id="organization-invitation-token"
                                value={invitationToken}
                                onChange={(event) => setInvitationToken(event.target.value)}
                                autoComplete="off"
                                minLength={8}
                                maxLength={2048}
                                required
                                disabled={loading}
                                aria-describedby="organization-invitation-help"
                                className="min-h-12 w-full rounded-md border border-gray-300 px-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p id="organization-invitation-help" className="mt-1 text-xs text-gray-500">
                                Ask your administrator for the invitation link. Opening it fills this securely.
                            </p>
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={loading || !isOnline || !invitationToken.trim()}
                        className="flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading && <Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" />}
                        {loading ? 'Joining organization...' : 'Accept invitation and join'}
                    </button>
                </form>
            )}

            <button
                type="button"
                onClick={logout}
                disabled={loading}
                className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
                Sign out and use another Google account
            </button>
        </section>
    );
};


export default OrganizationOnboarding;
