/**
 * useFeatureFlags Hook
 * 
 * Provides access to feature flags and business configuration settings.
 * Caches settings locally for offline support and performance.
 * 
 * Usage:
 * const { customerMode, isB2BOnly, loading } = useFeatureFlags();
 */

import { useState, useEffect, useCallback } from 'react';
import settingsApi from '../../services/api/modules/settings/settings.api';

// ============================================
// Types
// ============================================

export type CustomerMode = 'b2b' | 'b2c' | 'hybrid';

export interface FeatureFlags {
    // Business Mode
    customer_mode: CustomerMode;
    default_customer_type: string;
    require_drug_license: boolean;
    require_gst_for_b2b: boolean;

    // Inventory Features
    allowNegativeStock: boolean;
    expiryDateMandatory: boolean;
    batchWiseTracking: boolean;
    lowStockAlerts: boolean;

    // Sales Features
    creditLimitForParties: boolean;
    creditLimitThreshold: number;
    salesReturnFlow: string;
    discountLimit: number;

    // GST Features
    gstRoundOff: boolean;
    ewayBillEnabled: boolean;
    ewayBillThreshold: number;

    // Other flags can be added as needed
    [key: string]: any;
}

export interface UseFeatureFlagsResult {
    // Feature data
    features: FeatureFlags;
    loading: boolean;
    error: string | null;

    // Business mode helpers
    customerMode: CustomerMode;
    isB2BOnly: boolean;
    isB2COnly: boolean;
    isHybridMode: boolean;

    // Actions
    refetch: () => Promise<void>;
    updateFeature: (key: string, value: any) => Promise<boolean>;
}

// ============================================
// Default Values
// ============================================

const DEFAULT_FEATURES: FeatureFlags = {
    // Business Mode - Default to B2B for pharma
    customer_mode: 'b2b',
    default_customer_type: 'pharmacy',
    require_drug_license: true,
    require_gst_for_b2b: false,

    // Inventory Features
    allowNegativeStock: false,
    expiryDateMandatory: true,
    batchWiseTracking: true,
    lowStockAlerts: true,

    // Sales Features
    creditLimitForParties: true,
    creditLimitThreshold: 100000,
    salesReturnFlow: 'with-credit-note',
    discountLimit: 20,

    // GST Features
    gstRoundOff: true,
    ewayBillEnabled: true,
    ewayBillThreshold: 50000,
};

// Local storage key for caching
const CACHE_KEY = 'pharma_feature_flags';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// Hook Implementation
// ============================================

export function useFeatureFlags(): UseFeatureFlagsResult {
    const [features, setFeatures] = useState<FeatureFlags>(() => {
        // Try to load from cache on initial render
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_EXPIRY_MS) {
                    return { ...DEFAULT_FEATURES, ...data };
                }
            }
        } catch {
            // Ignore cache errors
        }
        return DEFAULT_FEATURES;
    });

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchFeatures = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await settingsApi.features.getAll();

            if (response?.data?.success && response.data.data?.features) {
                const fetchedFeatures = response.data.data.features;
                const mergedFeatures = { ...DEFAULT_FEATURES, ...fetchedFeatures };

                setFeatures(mergedFeatures);

                // Cache the result
                try {
                    localStorage.setItem(CACHE_KEY, JSON.stringify({
                        data: fetchedFeatures,
                        timestamp: Date.now()
                    }));
                } catch {
                    // Storage full or blocked
                }
            }
        } catch (err: any) {
            console.error('Failed to fetch feature flags:', err);
            setError(err.message || 'Failed to load feature settings');
            // Keep using cached/default values
        } finally {
            setLoading(false);
        }
    }, []);

    const updateFeature = useCallback(async (key: string, value: any): Promise<boolean> => {
        try {
            await settingsApi.features.update({ [key]: value });

            // Update local state
            setFeatures(prev => ({ ...prev, [key]: value }));

            // Update cache
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const { data, timestamp } = JSON.parse(cached);
                    localStorage.setItem(CACHE_KEY, JSON.stringify({
                        data: { ...data, [key]: value },
                        timestamp
                    }));
                }
            } catch {
                // Ignore cache errors
            }

            return true;
        } catch (err: any) {
            console.error('Failed to update feature:', err);
            setError(err.message || 'Failed to update feature');
            return false;
        }
    }, []);

    // Fetch on mount
    useEffect(() => {
        fetchFeatures();
    }, [fetchFeatures]);

    // Computed values for business mode
    const customerMode = features.customer_mode || 'b2b';
    const isB2BOnly = customerMode === 'b2b';
    const isB2COnly = customerMode === 'b2c';
    const isHybridMode = customerMode === 'hybrid';

    return {
        features,
        loading,
        error,
        customerMode,
        isB2BOnly,
        isB2COnly,
        isHybridMode,
        refetch: fetchFeatures,
        updateFeature
    };
}

export default useFeatureFlags;
