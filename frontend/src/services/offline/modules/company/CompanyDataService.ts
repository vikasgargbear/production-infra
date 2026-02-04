/**
 * Company Data Service
 * 
 * Unified data access layer for company profile.
 * Pattern: Memory Cache → IndexedDB → API (fallback)
 * 
 * Matches architecture of: SalesDataService, PurchaseDataService
 */

import { CompanyMemoryCache, CompanyProfile } from './CompanyMemoryCache';
import offlineDB from '../../core/offlineDatabase';
import { settingsApi } from '../../../api';

const LOG_PREFIX = '[CompanyDataService]';
const STORE_KEY = 'current';

class CompanyDataServiceClass {
    /**
     * Get company profile (instant from cache, falls back to IndexedDB/API)
     * 
     * Performance:
     * - Memory cache hit: <1ms
     * - IndexedDB hit: 5-20ms
     * - API call: 200-1500ms
     */
    async getProfile(): Promise<CompanyProfile | null> {
        // Fast path: Memory cache (instant)
        if (CompanyMemoryCache.isReady()) {
            return CompanyMemoryCache.get();
        }

        console.log(`${LOG_PREFIX} Cache miss, loading from IndexedDB...`);

        // Medium path: IndexedDB (5-20ms)
        try {
            const cached = await offlineDB.get('company_profile', STORE_KEY);
            if (cached) {
                CompanyMemoryCache.set(cached);
                console.log(`${LOG_PREFIX} Loaded from IndexedDB`);
                return cached;
            }
        } catch (err) {
            console.warn(`${LOG_PREFIX} IndexedDB read failed:`, err);
        }

        // Slow path: API fetch (200-1500ms)
        console.log(`${LOG_PREFIX} IndexedDB miss, fetching from API...`);
        return this.fetchFromAPI();
    }

    /**
     * Fetch profile from API and save to IndexedDB + memory cache
     */
    async fetchFromAPI(): Promise<CompanyProfile | null> {
        try {
            const response = await settingsApi.getCompanyInfo();

            if (response?.data?.success && response.data.data) {
                const info = response.data.data;
                const profile = this.transformAPIResponse(info);

                // Save to IndexedDB (background)
                await this.saveToIndexedDB(profile);

                // Update memory cache
                CompanyMemoryCache.set(profile);

                console.log(`${LOG_PREFIX} ✅ Fetched from API and cached`);
                return profile;
            }

            // Fallback: Try getSettings endpoint
            const settingsResponse = await (settingsApi as any).getSettings?.();
            if (settingsResponse?.data?.success && settingsResponse.data.data) {
                const settings = settingsResponse.data.data;
                const profile = this.transformSettingsResponse(settings);

                await this.saveToIndexedDB(profile);
                CompanyMemoryCache.set(profile);

                return profile;
            }
        } catch (err) {
            console.error(`${LOG_PREFIX} API fetch failed:`, err);
        }

        return null;
    }

    /**
     * Save profile to IndexedDB
     */
    async saveToIndexedDB(profile: CompanyProfile): Promise<void> {
        try {
            const db = await offlineDB.init();
            await db.put('company_profile', {
                ...profile,
                key: STORE_KEY,
                updated_at: new Date().toISOString()
            });
        } catch (err) {
            console.error(`${LOG_PREFIX} IndexedDB save failed:`, err);
        }
    }

    /**
     * Update profile (called after CompanyProfile.tsx save)
     * Updates IndexedDB and invalidates memory cache
     */
    async updateProfile(profile: Partial<CompanyProfile>): Promise<void> {
        const existing = await this.getProfile();
        const updated: CompanyProfile = {
            ...this.getDefaultProfile(),
            ...existing,
            ...profile,
            key: STORE_KEY,
            updated_at: new Date().toISOString()
        };

        // Save to IndexedDB
        await this.saveToIndexedDB(updated);

        // Update memory cache
        CompanyMemoryCache.set(updated);

        console.log(`${LOG_PREFIX} Profile updated`);
    }

    /**
     * Invalidate all caches (forces re-fetch)
     */
    invalidateCache(): void {
        CompanyMemoryCache.invalidate();
        console.log(`${LOG_PREFIX} Cache invalidated`);
    }

    /**
     * Warm cache on app startup (call from App.tsx or similar)
     */
    async warmCache(): Promise<void> {
        if (CompanyMemoryCache.isReady()) {
            console.log(`${LOG_PREFIX} Cache already warm`);
            return;
        }

        await this.getProfile();
        console.log(`${LOG_PREFIX} Cache warmed`);
    }

    /**
     * Get logo URL (convenience method)
     */
    async getLogo(): Promise<string | null> {
        // Fast path
        if (CompanyMemoryCache.isReady()) {
            return CompanyMemoryCache.getLogo();
        }

        const profile = await this.getProfile();
        return profile?.company_logo || null;
    }

    // ==================== Private Helpers ====================

    private transformAPIResponse(info: any): CompanyProfile {
        return {
            key: STORE_KEY,
            company_name: info.org_name || info.legal_name || 'Company',
            company_address: info.registered_address || info.correspondence_address || '',
            company_city: info.city || '',
            company_state: info.state || '',
            company_pincode: info.pincode || '',
            company_gst_number: info.gst_number || '',
            company_drug_license: info.drug_license_number || '',
            company_phone: info.contact_numbers?.[0] || '',
            company_alternate_phone: info.contact_numbers?.[1] || '',
            company_email: info.email_addresses?.[0] || '',
            company_website: info.website || '',
            company_pan: info.pan_number || '',
            company_cin: info.cin_number || '',
            company_fssai: info.fssai_number || '',
            company_msme: info.msme_number || '',
            company_logo: info.logo_url || info.logo || '',
            billing_address: info.registered_address || '',
            shipping_address: info.correspondence_address || info.registered_address || '',
            terms_and_conditions: info.terms_and_conditions || info.default_terms || '',
            bank_details: info.bank_details || {},
            updated_at: new Date().toISOString()
        };
    }

    private transformSettingsResponse(settings: any): CompanyProfile {
        return {
            key: STORE_KEY,
            company_name: settings.company_name || 'Company',
            company_address: settings.company_address || settings.billing_address || '',
            company_city: settings.city || '',
            company_state: settings.state || '',
            company_pincode: settings.pincode || '',
            company_gst_number: settings.gst_number || '',
            company_drug_license: settings.drug_license || settings.drug_license_number || '',
            company_phone: settings.phone || settings.contact_phone || '',
            company_alternate_phone: settings.alternate_phone || settings.secondary_phone || '',
            company_email: settings.email || settings.contact_email || '',
            company_website: settings.website || '',
            company_pan: settings.pan_number || '',
            company_cin: settings.cin_number || '',
            company_fssai: settings.fssai_number || '',
            company_msme: settings.msme_number || '',
            company_logo: settings.logo_url || settings.logo || '',
            billing_address: settings.billing_address || settings.company_address || '',
            shipping_address: settings.shipping_address || settings.company_address || '',
            terms_and_conditions: settings.terms_and_conditions || settings.default_terms || '',
            bank_details: settings.bank_details || {},
            updated_at: new Date().toISOString()
        };
    }

    private getDefaultProfile(): CompanyProfile {
        return {
            key: STORE_KEY,
            company_name: 'Company',
            company_address: '',
            company_city: '',
            company_state: '',
            company_pincode: '',
            company_gst_number: '',
            company_drug_license: '',
            company_phone: '',
            company_alternate_phone: '',
            company_email: '',
            company_website: '',
            company_pan: '',
            company_cin: '',
            company_fssai: '',
            company_msme: '',
            company_logo: '',
            billing_address: '',
            shipping_address: '',
            terms_and_conditions: '',
            bank_details: {},
            updated_at: new Date().toISOString()
        };
    }
}

// Singleton export
export const CompanyDataService = new CompanyDataServiceClass();
