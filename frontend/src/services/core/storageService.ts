
/**
 * Typed wrapper around localStorage to ensure type safety and centralized key management.
 */

export const STORAGE_KEYS = {
    AUTH_TOKEN: 'authToken',
    USER: 'pharma_user', // Aligned with API_CONFIG
    REFRESH_TOKEN: 'pharma_refresh_token',
    THEME: 'theme',

    // Cache Keys
    INVOICE_DRAFT: 'invoice_draft',
    EMPLOYEES_CACHE: 'employees_cache',
    EMPLOYEES_CACHE_TIME: 'employees_cache_time',
    COMPANY_DETAILS_CACHE: 'company_details_cache',
    COMPANY_DETAILS_CACHE_TIME: 'company_details_cache_time',
    COMPANY_INFO: 'companyInfo',

    // Organization / Company Info (Legacy)
    COMPANY_NAME: 'companyName', // Mixed naming convention in codebase
    COMPANY_GSTIN: 'companyGSTIN',
    COMPANY_LOGO: 'companyLogo',
    PHARMA_ORG_DETAILS: 'pharma_org_details',
    PHARMA_ORG_ID: 'pharma_org_id',

    // Sync
    LAST_SYNC: 'last_sync_time'
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS] | string;

class StorageService {
    /**
     * Get an item from localStorage and parse it.
     * Returns null if key doesn't exist or parsing fails.
     */
    getItem<T>(key: StorageKey): T | null {
        try {
            const item = localStorage.getItem(key);
            if (!item) return null;

            // Attempt to parse JSON, if fails return raw string
            try {
                return JSON.parse(item) as T;
            } catch {
                return item as unknown as T;
            }
        } catch (error) {
            console.error(`[StorageService] Error reading ${key}:`, error);
            return null;
        }
    }

    /**
     * Set a value in localStorage.
     * Automatically stringifies objects.
     */
    setItem<T>(key: StorageKey, value: T): void {
        try {
            const storedValue = typeof value === 'string' ? value : JSON.stringify(value);
            localStorage.setItem(key, storedValue);
        } catch (error) {
            console.error(`[StorageService] Error writing ${key}:`, error);
        }
    }

    /**
     * Remove an item from localStorage
     */
    removeItem(key: StorageKey): void {
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error(`[StorageService] Error removing ${key}:`, error);
        }
    }

    /**
     * Clear all localStorage
     */
    clear(): void {
        try {
            localStorage.clear();
        } catch (error) {
            console.error('[StorageService] Error clearing storage:', error);
        }
    }

    /**
     * Check if a key exists in storage
     */
    has(key: StorageKey): boolean {
        return localStorage.getItem(key) !== null;
    }
}

export const storageService = new StorageService();
