/**
 * Login Page Component - TypeScript Version
 */

import React, { useState, FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2, AlertCircle } from 'lucide-react';
import OrganizationOnboarding from './OrganizationOnboarding';
import { invitationTokenFromLocation } from '../../services/auth/oauthConsentClient';

const LoginPage: React.FC = () => {
    const {
        login,
        loginWithGoogle,
        logout,
        retrySessionExchange,
        hasCloudSession,
        sessionExchangeError,
        onboardingRequired,
        isOnline,
    } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const invitationToken = invitationTokenFromLocation(window.location);
    const showingOrganizationOnboarding = hasCloudSession && onboardingRequired;

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const result = await login(email, password);

            if (!result.success) {
                setError(result.error || 'Login failed');
            }
        } catch (err) {
            setError('An unexpected error occurred');
            console.error('Login error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setError('');
        setLoading(true);
        try {
            const result = await loginWithGoogle();
            if (result && !result.success && result.error) {
                setError(result.error);
            }
        } catch {
            setError('Google login failed');
        } finally {
            setLoading(false);
        }
    };

    const handleRetry = async () => {
        setError('');
        setLoading(true);
        try {
            const result = await retrySessionExchange();
            if (!result.success) setError(result.error || 'Unable to connect to ERP.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-start justify-center overflow-y-auto bg-gray-50 px-4 py-6 sm:items-center">
            <div
                data-testid="login-panel"
                className={`w-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8 ${showingOrganizationOnboarding ? 'max-w-4xl lg:p-10' : 'max-w-md'}`}
            >
                {/* Header */}
                <div className={`mb-7 text-center ${showingOrganizationOnboarding ? 'sm:flex sm:items-center sm:text-left' : ''}`}>
                    <div className={`mx-auto mb-4 flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 ${showingOrganizationOnboarding ? 'sm:mx-0 sm:mb-0 sm:mr-4' : ''}`}>
                        <svg className="h-8 w-8 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="mb-1 text-2xl font-bold text-gray-900 sm:text-3xl">Pharma ERP</h1>
                        <p className="text-gray-600">
                            {showingOrganizationOnboarding
                                ? 'Create or join your organization'
                                : 'Continue with Google to create or join an organization'}
                        </p>
                    </div>
                </div>

                {!isOnline && (
                    <div className="mb-4 flex items-start rounded-lg border border-red-200 bg-red-50 p-3 text-red-800">
                        <AlertCircle className="mr-2 mt-0.5 h-4 w-4 shrink-0" />
                        <span className="text-sm">The live ERP service is unavailable. Sign-in requires the cloud API.</span>
                    </div>
                )}

                {/* Error Message */}
                {(error || (onboardingRequired ? '' : sessionExchangeError)) && (
                    <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
                        <AlertCircle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-red-800">{error || sessionExchangeError}</div>
                    </div>
                )}

                {hasCloudSession && onboardingRequired ? (
                    <OrganizationOnboarding />
                ) : hasCloudSession ? (
                    <div className="space-y-4">
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                            Your cloud sign-in is still active. Reconnect to the live ERP, or sign out to use another account.
                        </div>
                        <button
                            type="button"
                            onClick={handleRetry}
                            disabled={loading || !isOnline}
                            className="flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                            {loading ? 'Reconnecting...' : 'Retry ERP connection'}
                        </button>
                        <button
                            type="button"
                            onClick={logout}
                            disabled={loading}
                            className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-4 py-3 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Sign out
                        </button>
                    </div>
                ) : (
                <>
                {invitationToken && (
                    <div className="mb-5 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                        Your organization invitation is ready. Continue with the invited Google account to join.
                    </div>
                )}
                <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={loading || !isOnline}
                    className="flex min-h-11 w-full items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-3 font-medium text-gray-800 transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <svg aria-hidden="true" className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                </button>

                {/* Login Form */}
                <details className="mt-6 rounded-lg border border-gray-200 p-4">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700">
                        Use email and password instead
                    </summary>
                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                    <div>
                        <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-2">
                            Email Address
                        </label>
                        <input
                            id="login-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                            placeholder="name@company.com"
                            required
                            disabled={loading}
                        />
                    </div>

                    <div>
                        <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-2">
                            Password
                        </label>
                        <input
                            id="login-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                            placeholder="Enter your password"
                            required
                            disabled={loading}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !isOnline}
                        className="flex min-h-11 w-full items-center justify-center rounded-md bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                Signing in...
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>
                </details>
                </>
                )}

                {/* Footer */}
                <div className="mt-6 text-center text-sm text-gray-500">
                    {!isOnline && (
                        <p>An internet connection is required to sign in</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
