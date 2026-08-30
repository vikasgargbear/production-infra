import React, { FormEvent, useEffect, useState } from 'react';
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
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CreateOrganizationInput, string>>>({});
    const [loading, setLoading] = useState(false);

    const updateOrganization = (field: keyof CreateOrganizationInput, value: string) => {
        setOrganization((previous) => ({ ...previous, [field]: value }));
        setFieldErrors((previous) => {
            if (!previous[field]) return previous;
            const next = { ...previous };
            delete next[field];
            return next;
        });
    };

    const fieldDescription = (field: keyof CreateOrganizationInput, helpId?: string) => (
        [helpId, fieldErrors[field] ? `organization-${field.replace('_', '-')}-error` : '']
            .filter(Boolean)
            .join(' ') || undefined
    );

    useEffect(() => {
        const firstInvalidField = Object.keys(fieldErrors)[0] as keyof CreateOrganizationInput | undefined;
        if (firstInvalidField) {
            document.getElementById(`organization-${firstInvalidField.replace('_', '-')}`)?.focus();
        }
    }, [fieldErrors]);

    const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        setFieldErrors({});
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
                if (result.fieldErrors) {
                    setFieldErrors(result.fieldErrors);
                }
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
            <div>
                <h2 id="organization-onboarding-heading" className="text-lg font-semibold text-gray-950">
                    Set up your workspace
                </h2>
                <p className="mt-1 text-sm text-gray-600">
                    Your Google account is connected. Start a new organization or use an invitation from your administrator.
                </p>
            </div>

            {error && (
                <div role="alert" aria-live="assertive" className="flex items-start rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <AlertCircle aria-hidden="true" className="mr-2 mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2" aria-label="Organization setup options">
                <button
                    type="button"
                    aria-pressed={mode === 'create'}
                    onClick={() => { setMode('create'); setError(''); }}
                    disabled={loading}
                    className={`flex min-h-14 items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${mode === 'create' ? 'border-blue-600 bg-blue-50 text-blue-950' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'}`}
                >
                    <Building2 aria-hidden="true" className="h-5 w-5 shrink-0" />
                    <span className="block font-semibold">Create new organization</span>
                </button>
                <button
                    type="button"
                    aria-pressed={mode === 'join'}
                    onClick={() => { setMode('join'); setError(''); }}
                    disabled={loading}
                    className={`flex min-h-14 items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${mode === 'join' ? 'border-blue-600 bg-blue-50 text-blue-950' : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'}`}
                >
                    <MailCheck aria-hidden="true" className="h-5 w-5 shrink-0" />
                    <span className="block font-semibold">Join with invitation</span>
                </button>
            </div>

            {mode === 'create' ? (
                <form onSubmit={handleCreate} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:p-5" aria-label="Create organization">
                    <div className="mb-5">
                        <h3 className="font-semibold text-gray-950">Organization details</h3>
                        <p className="mt-1 text-sm text-gray-600">Use the registered business identity and primary address for this workspace.</p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-6">
                        <div className="md:col-span-3">
                            <label htmlFor="organization-legal-name" className="mb-1 block text-sm font-medium text-gray-800">
                                Legal name
                            </label>
                            <input
                                id="organization-legal-name"
                                name="organization-legal-name"
                                value={organization.legal_name}
                                onChange={(event) => updateOrganization('legal_name', event.target.value)}
                                autoComplete="organization"
                                minLength={2}
                                maxLength={200}
                                required
                                disabled={loading}
                                aria-invalid={Boolean(fieldErrors.legal_name)}
                                aria-describedby={fieldDescription('legal_name')}
                                className={`min-h-11 w-full rounded-md border bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 ${fieldErrors.legal_name ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                            />
                            {fieldErrors.legal_name && <p id="organization-legal-name-error" className="mt-1 text-sm text-red-700">{fieldErrors.legal_name}</p>}
                        </div>
                        <div className="md:col-span-3">
                            <label htmlFor="organization-trade-name" className="mb-1 block text-sm font-medium text-gray-800">
                                Trade name <span className="font-normal text-gray-500">(optional)</span>
                            </label>
                            <input
                                id="organization-trade-name"
                                name="organization-trade-name"
                                value={organization.trade_name}
                                onChange={(event) => updateOrganization('trade_name', event.target.value)}
                                minLength={2}
                                maxLength={200}
                                disabled={loading}
                                aria-invalid={Boolean(fieldErrors.trade_name)}
                                aria-describedby={fieldDescription('trade_name')}
                                className={`min-h-11 w-full rounded-md border bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 ${fieldErrors.trade_name ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                            />
                            {fieldErrors.trade_name && <p id="organization-trade-name-error" className="mt-1 text-sm text-red-700">{fieldErrors.trade_name}</p>}
                        </div>
                        <div className="md:col-span-6">
                            <label htmlFor="organization-address-line1" className="mb-1 block text-sm font-medium text-gray-800">
                                Address line 1
                            </label>
                            <input
                                id="organization-address-line1"
                                name="organization-address-line1"
                                value={organization.address_line1}
                                onChange={(event) => updateOrganization('address_line1', event.target.value)}
                                autoComplete="address-line1"
                                minLength={5}
                                maxLength={240}
                                required
                                disabled={loading}
                                aria-invalid={Boolean(fieldErrors.address_line1)}
                                aria-describedby={fieldDescription('address_line1')}
                                className={`min-h-11 w-full rounded-md border bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 ${fieldErrors.address_line1 ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                            />
                            {fieldErrors.address_line1 && <p id="organization-address-line1-error" className="mt-1 text-sm text-red-700">{fieldErrors.address_line1}</p>}
                        </div>
                        <div className="md:col-span-2">
                            <label htmlFor="organization-city" className="mb-1 block text-sm font-medium text-gray-800">
                                City
                            </label>
                            <input
                                id="organization-city"
                                name="organization-city"
                                value={organization.city}
                                onChange={(event) => updateOrganization('city', event.target.value)}
                                autoComplete="address-level2"
                                minLength={2}
                                maxLength={120}
                                required
                                disabled={loading}
                                aria-invalid={Boolean(fieldErrors.city)}
                                aria-describedby={fieldDescription('city')}
                                className={`min-h-11 w-full rounded-md border bg-white px-3 py-2.5 text-base focus:outline-none focus:ring-2 ${fieldErrors.city ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`}
                            />
                            {fieldErrors.city && <p id="organization-city-error" className="mt-1 text-sm text-red-700">{fieldErrors.city}</p>}
                        </div>
                        <div className="md:col-span-2">
                            <label htmlFor="organization-state-code" className="mb-1 block text-sm font-medium text-gray-800">
                                GST state code
                            </label>
                            <input
                                id="organization-state-code"
                                name="organization-state-code"
                                value={organization.state_code}
                                onChange={(event) => updateOrganization('state_code', event.target.value)}
                                inputMode="numeric"
                                pattern="[0-9]{2}"
                                maxLength={2}
                                placeholder="e.g. 27"
                                title="Enter the 2-digit Indian GST state code"
                                aria-invalid={Boolean(fieldErrors.state_code)}
                                aria-describedby={fieldDescription('state_code', 'organization-state-code-help')}
                                required
                                disabled={loading}
                                className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p id="organization-state-code-help" className="mt-1 text-xs text-gray-500">2 digits, for example 27</p>
                            {fieldErrors.state_code && <p id="organization-state-code-error" className="mt-1 text-sm text-red-700">{fieldErrors.state_code}</p>}
                        </div>
                        <div className="md:col-span-2">
                            <label htmlFor="organization-postal-code" className="mb-1 block text-sm font-medium text-gray-800">
                                Postal code
                            </label>
                            <input
                                id="organization-postal-code"
                                name="organization-postal-code"
                                value={organization.postal_code}
                                onChange={(event) => updateOrganization('postal_code', event.target.value)}
                                autoComplete="postal-code"
                                inputMode="numeric"
                                pattern="[1-9][0-9]{5}"
                                maxLength={6}
                                placeholder="e.g. 400001"
                                title="Enter a 6-digit Indian postal code"
                                aria-invalid={Boolean(fieldErrors.postal_code)}
                                aria-describedby={fieldDescription('postal_code', 'organization-postal-code-help')}
                                required
                                disabled={loading}
                                className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p id="organization-postal-code-help" className="mt-1 text-xs text-gray-500">6-digit PIN code</p>
                            {fieldErrors.postal_code && <p id="organization-postal-code-error" className="mt-1 text-sm text-red-700">{fieldErrors.postal_code}</p>}
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading || !isOnline}
                        className="mt-5 flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:w-auto sm:min-w-56"
                    >
                        {loading && <Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin" />}
                        {loading ? 'Creating organization...' : 'Create organization'}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleAcceptInvitation} className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:p-5" aria-label="Join with invitation">
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
                                name="organization-invitation-token"
                                value={invitationToken}
                                onChange={(event) => setInvitationToken(event.target.value)}
                                autoComplete="off"
                                minLength={8}
                                maxLength={2048}
                                required
                                disabled={loading}
                                aria-describedby="organization-invitation-help"
                                className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p id="organization-invitation-help" className="mt-1 text-xs text-gray-500">
                                Ask your administrator for the invitation link. Opening it fills this securely.
                            </p>
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={loading || !isOnline || !invitationToken.trim()}
                        className="flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:w-auto sm:min-w-64"
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
                className="mx-auto flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
                Sign out and use another Google account
            </button>
        </section>
    );
};


export default OrganizationOnboarding;
