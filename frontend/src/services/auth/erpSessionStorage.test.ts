import {
    ERP_SESSION_KEYS,
    clearErpSessionStorage,
    getErpAccessToken,
    getErpSessionUser,
    saveErpSession,
} from './erpSessionStorage';


beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
});


test('stores one canonical ERP token and user record', () => {
    saveErpSession('access-token', { user_id: 7, org_id: 'org-7' });

    expect(getErpAccessToken()).toBe('access-token');
    expect(getErpSessionUser()).toEqual({ user_id: 7, org_id: 'org-7' });
    expect(sessionStorage.getItem(ERP_SESSION_KEYS.accessToken)).toBe('access-token');
    expect(sessionStorage.getItem(ERP_SESSION_KEYS.user)).not.toBeNull();
    expect(localStorage.getItem(ERP_SESSION_KEYS.accessToken)).toBeNull();
    expect(localStorage.getItem(ERP_SESSION_KEYS.user)).toBeNull();
});


test('saving and clearing remove every legacy tenant and token alias', () => {
    const legacyKeys = [
        'pharma_token', 'auth_token', 'pharma_org_id', 'org_id', 'orgId',
        'userData', 'pharma_branch_id', 'pharma_offline_creds',
        'pharma_refresh_token',
    ];
    legacyKeys.forEach((key) => localStorage.setItem(key, 'legacy'));

    saveErpSession('access-token', { user_id: 7 });
    legacyKeys.forEach((key) => expect(localStorage.getItem(key)).toBeNull());

    clearErpSessionStorage();
    expect(getErpAccessToken()).toBeNull();
    expect(getErpSessionUser()).toBeNull();
});
