export const ERP_SESSION_KEYS = Object.freeze({
    accessToken: 'authToken',
    user: 'pharma_user',
});

const LEGACY_SESSION_KEYS = [
    'pharma_token',
    'auth_token',
    'pharma_org_id',
    'org_id',
    'orgId',
    'userData',
    'pharma_branch_id',
    'pharma_offline_creds',
    'pharma_refresh_token',
] as const;


export function removeLegacyErpSessionKeys(): void {
    LEGACY_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
}


export function getErpAccessToken(): string | null {
    return sessionStorage.getItem(ERP_SESSION_KEYS.accessToken);
}


export function getErpSessionUser<T>(): T | null {
    const stored = sessionStorage.getItem(ERP_SESSION_KEYS.user);
    if (!stored) return null;
    try {
        return JSON.parse(stored) as T;
    } catch {
        return null;
    }
}


export function saveErpSession<T>(accessToken: string, user: T): void {
    sessionStorage.setItem(ERP_SESSION_KEYS.accessToken, accessToken);
    sessionStorage.setItem(ERP_SESSION_KEYS.user, JSON.stringify(user));
    removeLegacyErpSessionKeys();
}


export function clearErpSessionStorage(): void {
    sessionStorage.removeItem(ERP_SESSION_KEYS.accessToken);
    sessionStorage.removeItem(ERP_SESSION_KEYS.user);
    removeLegacyErpSessionKeys();
}
