import {
    createNativeGoogleNonce,
    nativeGoogleAuthErrorCode,
    shouldUseGoogleBrowserFallback,
} from '../nativeGoogleAuth';

describe('Android native Google auth helpers', () => {
    it('creates a 256-bit base64url nonce without padding', () => {
        expect(createNativeGoogleNonce()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('falls back only for unavailable native-provider failures', () => {
        expect(shouldUseGoogleBrowserFallback({ code: 'NO_CREDENTIAL' })).toBe(true);
        expect(shouldUseGoogleBrowserFallback({ code: 'NATIVE_SIGN_IN_FAILED' })).toBe(true);
        expect(shouldUseGoogleBrowserFallback({ code: 'AUTH_CANCELLED' })).toBe(false);
        expect(shouldUseGoogleBrowserFallback({ code: 'INVALID_CREDENTIAL' })).toBe(false);
    });

    it('reads only a string error code', () => {
        expect(nativeGoogleAuthErrorCode({ code: 'AUTH_CANCELLED' })).toBe('AUTH_CANCELLED');
        expect(nativeGoogleAuthErrorCode({ code: 42 })).toBeNull();
        expect(nativeGoogleAuthErrorCode(null)).toBeNull();
    });
});
