/**
 * useFeatureFlags Hook
 * 
 * Provides access to feature flags and business configuration settings.
 * Reads settings from the live API. Browser storage is never an authority.
 * 
 * Usage:
 * const { customerMode, isB2BOnly, loading } = useFeatureFlags();
 */

import { useState, useEffect, useCallback } from 'react';
import apiClient from '../services/api/apiClient';

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

// ============================================
// Hook Implementation
// ============================================

export function useFeatureFlags(): UseFeatureFlagsResult {
    const [features, setFeatures] = useState<FeatureFlags>(DEFAULT_FEATURES);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchFeatures = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await apiClient.get('/settings/features');
            if (!response?.data?.features || typeof response.data.features !== 'object') {
                throw new Error('Feature settings returned an invalid canonical response');
            }
            setFeatures({ ...DEFAULT_FEATURES, ...response.data.features });
        } catch (err: any) {
            console.error('Failed to fetch feature flags:', err);
            setError(err.message || 'Failed to load feature settings');
            setFeatures(DEFAULT_FEATURES);
        } finally {
            setLoading(false);
        }
    }, []);

    const updateFeature = useCallback(async (key: string, value: any): Promise<boolean> => {
        try {
            await apiClient.patch('/settings/features', { [key]: value });
            setFeatures(prev => ({ ...prev, [key]: value }));
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
