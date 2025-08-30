/**
 * Custom hook for managing return reasons with caching
 */
import { useState, useEffect } from 'react';
import { metadataApi } from '../../../services/api';

const CACHE_KEY = 'return_reasons_cache';
const CACHE_DURATION = 3600000; // 1 hour

const DEFAULT_REASONS = [
  { value: 'DAMAGED', label: 'Damaged Product' },
  { value: 'EXPIRED', label: 'Expired Product' },
  { value: 'WRONG_ITEM', label: 'Wrong Item Delivered' },
  { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
  { value: 'NOT_REQUIRED', label: 'Not Required' },
  { value: 'DAMAGED_IN_TRANSIT', label: 'Damaged in Transit' },
  { value: 'SHORT_EXPIRY', label: 'Short Expiry' },
  { value: 'BATCH_RECALL', label: 'Batch Recall' },
  { value: 'OTHER', label: 'Other' }
];

export function useReturnReasons() {
  const [reasons, setReasons] = useState(() => {
    // Try to get cached reasons first
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_DURATION) {
          return parsed.data;
        }
      }
    } catch (e) {
      console.error('Failed to parse cached return reasons:', e);
    }
    return [];
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Only load if we don't have cached data
    if (reasons.length === 0) {
      loadReasons();
    }
  }, []);

  const loadReasons = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await metadataApi.getReturnReasons();
      
      if (response?.data && Array.isArray(response.data)) {
        const formattedReasons = response.data.map(reason => ({
          value: reason.value || reason.code || reason.id,
          label: reason.label || reason.name || reason.description
        }));
        
        setReasons(formattedReasons);
        
        // Cache the reasons
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          data: formattedReasons,
          timestamp: Date.now()
        }));
      } else {
        // Use defaults if API returns unexpected format
        setReasons(DEFAULT_REASONS);
        cacheReasons(DEFAULT_REASONS);
      }
    } catch (error) {
      console.error('Failed to load return reasons:', error);
      setError(error.message);
      
      // Fallback to default reasons
      setReasons(DEFAULT_REASONS);
      cacheReasons(DEFAULT_REASONS);
    } finally {
      setLoading(false);
    }
  };

  const cacheReasons = (reasonsToCache) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: reasonsToCache,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('Failed to cache return reasons:', e);
    }
  };

  const clearCache = () => {
    localStorage.removeItem(CACHE_KEY);
    setReasons([]);
    loadReasons();
  };

  return {
    reasons,
    loading,
    error,
    reload: loadReasons,
    clearCache
  };
}