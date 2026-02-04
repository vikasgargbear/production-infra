/**
 * Company Profile Memory Cache
 * 
 * Provides instant access (<1ms) to company profile data.
 * Layer above IndexedDB, below React components.
 * 
 * Pattern matches: SalesMemoryCache, PurchaseMemoryCache
 */

export interface CompanyProfile {
    key: string;
    company_name: string;
    company_address: string;
    company_city: string;
    company_state: string;
    company_pincode: string;
    company_gst_number: string;
    company_drug_license: string;
    company_phone: string;
    company_alternate_phone: string;
    company_email: string;
    company_website: string;
    company_pan: string;
    company_cin: string;
    company_fssai: string;
    company_msme: string;
    company_logo: string;
    billing_address: string;
    shipping_address: string;
    terms_and_conditions: string;
    bank_details: Record<string, any>;
    updated_at: string;
}

const LOG_PREFIX = '[CompanyCache]';

class CompanyMemoryCacheClass {
    private profile: CompanyProfile | null = null;
    private lastUpdated: number = 0;
    private ready: boolean = false;

    /**
     * Get cached company profile (instant, <1ms)
     */
    get(): CompanyProfile | null {
        return this.profile;
    }

    /**
     * Set company profile in memory cache
     */
    set(profile: CompanyProfile): void {
        this.profile = profile;
        this.lastUpdated = Date.now();
        this.ready = true;
        console.log(`${LOG_PREFIX} Cache updated at ${new Date().toISOString()}`);
    }

    /**
     * Check if cache is ready (has been warmed)
     */
    isReady(): boolean {
        return this.ready && this.profile !== null;
    }

    /**
     * Get cache age in milliseconds
     */
    getAge(): number {
        return Date.now() - this.lastUpdated;
    }

    /**
     * Invalidate cache (forces re-fetch from IndexedDB/API)
     */
    invalidate(): void {
        this.profile = null;
        this.ready = false;
        this.lastUpdated = 0;
        console.log(`${LOG_PREFIX} Cache invalidated`);
    }

    /**
     * Get specific field from profile (convenience method)
     */
    getField<K extends keyof CompanyProfile>(field: K): CompanyProfile[K] | null {
        return this.profile ? this.profile[field] : null;
    }

    /**
     * Get logo (common use case)
     */
    getLogo(): string | null {
        return this.profile?.company_logo || null;
    }

    /**
     * Get company name (common use case)
     */
    getName(): string {
        return this.profile?.company_name || 'Company';
    }
}

// Singleton export
export const CompanyMemoryCache = new CompanyMemoryCacheClass();
