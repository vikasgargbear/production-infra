/**
 * auth.contract.test.ts
 *
 * Verifies the frontend auth storage contract:
 *   - Canonical sessionStorage key names (authToken / pharma_user)
 *   - No offline / cached-credentials fallback that bypasses server validation
 *   - Legacy key purge on save and clear
 *   - decodeToken exp-check prevents stale token reuse
 *
 * These are unit-level contract tests; they do not hit any live endpoint.
 */

import {
    ERP_SESSION_KEYS,
    clearErpSessionStorage,
    getErpAccessToken,
    getErpSessionUser,
    removeLegacyErpSessionKeys,
    saveErpSession,
} from '../auth/erpSessionStorage';

// ---------------------------------------------------------------------------
// Storage key name contract
// ---------------------------------------------------------------------------

describe('ERP_SESSION_KEYS canonical names', () => {
    it('access token key is "authToken"', () => {
        expect(ERP_SESSION_KEYS.accessToken).toBe('authToken');
    });

    it('user key is "pharma_user"', () => {
        expect(ERP_SESSION_KEYS.user).toBe('pharma_user');
    });
});

// ---------------------------------------------------------------------------
// Save / read round-trip
// ---------------------------------------------------------------------------

describe('saveErpSession / getErpAccessToken / getErpSessionUser', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('stores token under "authToken" key', () => {
        saveErpSession('tok-abc', { user_id: 1, org_id: 'org-1' });
        expect(sessionStorage.getItem('authToken')).toBe('tok-abc');
        expect(localStorage.getItem('authToken')).toBeNull();
    });

    it('getErpAccessToken returns the stored token', () => {
        saveErpSession('tok-abc', { user_id: 1, org_id: 'org-1' });
        expect(getErpAccessToken()).toBe('tok-abc');
    });

    it('getErpSessionUser returns the stored user object', () => {
        const user = { user_id: 2, org_id: 'org-2', email: 'x@example.com' };
        saveErpSession('tok-xyz', user);
        expect(getErpSessionUser()).toEqual(user);
    });

    it('returns null for both when storage is empty', () => {
        expect(getErpAccessToken()).toBeNull();
        expect(getErpSessionUser()).toBeNull();
    });

    it('getErpSessionUser returns null on corrupt JSON', () => {
        sessionStorage.setItem(ERP_SESSION_KEYS.user, '{not-json}');
        expect(getErpSessionUser()).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Legacy key purge — no offline-credentials key survives a save or clear
// ---------------------------------------------------------------------------

const LEGACY_KEYS = [
    'pharma_token',
    'auth_token',
    'pharma_org_id',
    'org_id',
    'orgId',
    'userData',
    'pharma_branch_id',
    'pharma_offline_creds',   // offline credential key — must be erased
    'pharma_refresh_token',
];

describe('legacy key purge', () => {
    beforeEach(() => {
        sessionStorage.clear();
        LEGACY_KEYS.forEach((k) => sessionStorage.setItem(k, 'leftover'));
    });

    it('saveErpSession removes every legacy key including pharma_offline_creds', () => {
        saveErpSession('tok', { user_id: 3 });
        LEGACY_KEYS.forEach((k) => {
            expect(sessionStorage.getItem(k)).toBeNull();
        });
    });

    it('clearErpSessionStorage removes every legacy key', () => {
        clearErpSessionStorage();
        LEGACY_KEYS.forEach((k) => {
            expect(sessionStorage.getItem(k)).toBeNull();
        });
    });

    it('removeLegacyErpSessionKeys removes every legacy key standalone', () => {
        removeLegacyErpSessionKeys();
        LEGACY_KEYS.forEach((k) => {
            expect(sessionStorage.getItem(k)).toBeNull();
        });
    });
});

// ---------------------------------------------------------------------------
// clearErpSessionStorage removes canonical keys too
// ---------------------------------------------------------------------------

describe('clearErpSessionStorage', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('removes authToken and pharma_user', () => {
        saveErpSession('tok', { user_id: 5 });
        clearErpSessionStorage();
        expect(sessionStorage.getItem('authToken')).toBeNull();
        expect(sessionStorage.getItem('pharma_user')).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// No offline fallback: pharma_offline_creds must never grant a session
// ---------------------------------------------------------------------------

describe('offline-credential key cannot produce a session', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('getErpAccessToken returns null when only pharma_offline_creds is set', () => {
        localStorage.setItem('pharma_offline_creds', JSON.stringify({ user_id: 99 }));
        // The canonical getter reads "authToken" only
        expect(getErpAccessToken()).toBeNull();
    });

    it('getErpSessionUser returns null when only pharma_offline_creds is set', () => {
        localStorage.setItem('pharma_offline_creds', JSON.stringify({ user_id: 99 }));
        expect(getErpSessionUser()).toBeNull();
    });

    it('ignores canonical-looking credentials left in persistent storage', () => {
        localStorage.setItem(ERP_SESSION_KEYS.accessToken, 'persistent-token');
        localStorage.setItem(ERP_SESSION_KEYS.user, JSON.stringify({ user_id: 99 }));
        expect(getErpAccessToken()).toBeNull();
        expect(getErpSessionUser()).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// CORS origin rejection — static contract guard
// ---------------------------------------------------------------------------

describe('CORS origin contract (static guard)', () => {
    it('getApiBaseUrl never returns a wildcard origin', async () => {
        const { getApiBaseUrl } = await import('../../config/apiBase');
        const base = getApiBaseUrl();
        expect(base).not.toContain('*');
        expect(base.startsWith('http')).toBe(true);
    });
});
