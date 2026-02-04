/**
 * useCompanyDetails Hook
 * 
 * Provides company profile data using offline-first architecture.
 * Data flow: Memory Cache → IndexedDB → API
 * 
 * Performance:
 * - Memory cache hit: <1ms (instant)
 * - IndexedDB hit: 5-20ms
 * - API fallback: 200-1500ms
 */

import { useState, useEffect, useCallback } from 'react';
import { CompanyDataService, CompanyMemoryCache, type CompanyProfile } from '../services/offline/modules/company';

// Re-export types for backward compatibility
export type { CompanyProfile };

export interface CompanyDetails extends CompanyProfile {
    // Alias for backward compatibility
}

interface UseCompanyDetailsReturn {
    companyDetails: CompanyDetails;
    loading: boolean;
    error: Error | null;
    refreshCompanyDetails: () => Promise<void>;
}

const defaultCompanyDetails: CompanyDetails = {
    key: 'current',
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
    updated_at: ''
};

const useCompanyDetails = (): UseCompanyDetailsReturn => {
    const [companyDetails, setCompanyDetails] = useState<CompanyDetails>(() => {
        // Instant sync read from memory cache on mount
        const cached = CompanyMemoryCache.get();
        return cached || defaultCompanyDetails;
    });
    const [loading, setLoading] = useState<boolean>(!CompanyMemoryCache.isReady());
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let mounted = true;

        const loadCompanyDetails = async () => {
            // If memory cache is ready, we already have data from useState initializer
            if (CompanyMemoryCache.isReady()) {
                setLoading(false);
                return;
            }

            try {
                const profile = await CompanyDataService.getProfile();

                if (mounted && profile) {
                    setCompanyDetails(profile);
                }
            } catch (err) {
                console.error('[useCompanyDetails] Error loading profile:', err);
                if (mounted) {
                    setError(err as Error);
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };

        loadCompanyDetails();

        return () => {
            mounted = false;
        };
    }, []);

    /**
     * Refresh company details (invalidates cache and fetches fresh)
     * No longer requires page reload!
     */
    const refreshCompanyDetails = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(null);

        try {
            // Invalidate memory cache
            CompanyDataService.invalidateCache();

            // Fetch fresh from API
            const profile = await CompanyDataService.fetchFromAPI();

            if (profile) {
                setCompanyDetails(profile);
            }
        } catch (err) {
            console.error('[useCompanyDetails] Error refreshing:', err);
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, []);

    return { companyDetails, loading, error, refreshCompanyDetails };
};

export default useCompanyDetails;
