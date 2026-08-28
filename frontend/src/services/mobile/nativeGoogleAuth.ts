import { Capacitor, registerPlugin } from '@capacitor/core';

interface NativeGoogleAuthPlugin {
    signIn(options: { nonce: string }): Promise<{ idToken: string }>;
    signOut(): Promise<void>;
}

export interface NativeGoogleCredential {
    idToken: string;
    nonce: string;
}

const NativeGoogleAuth = registerPlugin<NativeGoogleAuthPlugin>('NativeGoogleAuth');

export const isNativeGoogleAuthAvailable = (): boolean => (
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
);

export const createNativeGoogleNonce = (): string => {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    return btoa(binary)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
};

export const sha256Hex = async (value: string): Promise<string> => {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(value),
    );
    return Array.from(new Uint8Array(digest), byte => (
        byte.toString(16).padStart(2, '0')
    )).join('');
};

export const signInWithNativeGoogle = async (): Promise<NativeGoogleCredential> => {
    const nonce = createNativeGoogleNonce();
    const result = await NativeGoogleAuth.signIn({ nonce: await sha256Hex(nonce) });
    if (!result.idToken || result.idToken.split('.').length !== 3) {
        const error = new Error('Android returned an invalid Google credential');
        Object.assign(error, { code: 'INVALID_CREDENTIAL' });
        throw error;
    }
    return { idToken: result.idToken, nonce };
};

export const clearNativeGoogleCredentialState = async (): Promise<void> => {
    if (isNativeGoogleAuthAvailable()) {
        await NativeGoogleAuth.signOut();
    }
};

export const nativeGoogleAuthErrorCode = (error: unknown): string | null => {
    if (typeof error !== 'object' || error === null || !('code' in error)) {
        return null;
    }
    return typeof error.code === 'string' ? error.code : null;
};

export const shouldUseGoogleBrowserFallback = (error: unknown): boolean => (
    new Set([
        'CONFIGURATION_MISSING',
        'NATIVE_AUTH_UNAVAILABLE',
        'NATIVE_SIGN_IN_FAILED',
        'NO_CREDENTIAL',
    ]).has(nativeGoogleAuthErrorCode(error) || '')
);
