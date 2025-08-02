/**
 * Simple Invoice Calculation Hook (No React Query dependency)
 * Provides invoice calculations using backend APIs
 * Fallback version without React Query
 */

import { useState, useCallback, useMemo } from 'react';
import { debounce } from 'lodash';
import InvoiceApiService from '../services/invoiceApiService';

/**
 * Hook for invoice calculations without React Query
 * @param {Object} options - Hook options
 * @returns {Object} Calculation methods and state
 */
export const useInvoiceCalculation = (options = {}) => {
  const {
    onSuccess,
    onError,
    debounceMs = 500,
    enableValidation = true
  } = options;

  // State management
  const [isCalculating, setIsCalculating] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isCheckingCredit, setIsCheckingCredit] = useState(false);
  
  const [calculationData, setCalculationData] = useState(null);
  const [validationData, setValidationData] = useState(null);
  const [creditData, setCreditData] = useState(null);
  
  const [calculationError, setCalculationError] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [creditError, setCreditError] = useState(null);

  // Calculate invoice with backend API
  const calculateImmediate = useCallback(async (invoiceData) => {
    setIsCalculating(true);
    setCalculationError(null);
    
    try {
      const result = await InvoiceApiService.calculateInvoice(invoiceData);
      
      if (result.success) {
        setCalculationData(result.data);
        onSuccess?.(result.data);
      } else {
        setCalculationError(result.error);
        onError?.(result.error);
      }
    } catch (error) {
      setCalculationError(error);
      onError?.(error);
    } finally {
      setIsCalculating(false);
    }
  }, [onSuccess, onError]);

  // Validate invoice
  const validate = useCallback(async (invoiceData) => {
    if (!enableValidation) return;
    
    setIsValidating(true);
    setValidationError(null);
    
    try {
      const result = await InvoiceApiService.validateInvoice(invoiceData);
      
      if (result.success) {
        setValidationData(result.data);
      } else {
        setValidationError(result.error);
      }
    } catch (error) {
      setValidationError(error);
    } finally {
      setIsValidating(false);
    }
  }, [enableValidation]);

  // Check customer credit
  const checkCredit = useCallback(async (customerId, amount) => {
    setIsCheckingCredit(true);
    setCreditError(null);
    
    try {
      const result = await InvoiceApiService.checkCustomerCredit(customerId, amount);
      
      if (result.success) {
        setCreditData(result.data);
      } else {
        setCreditError(result.error);
      }
    } catch (error) {
      setCreditError(error);
    } finally {
      setIsCheckingCredit(false);
    }
  }, []);

  // Debounced calculation function
  const debouncedCalculate = useMemo(
    () => debounce((invoiceData) => {
      if (invoiceData.items && invoiceData.items.length > 0) {
        calculateImmediate(invoiceData);
      }
    }, debounceMs),
    [calculateImmediate, debounceMs]
  );

  // Debounced validation function
  const debouncedValidate = useMemo(
    () => debounce((invoiceData) => {
      if (enableValidation && invoiceData.items && invoiceData.items.length > 0) {
        validate(invoiceData);
      }
    }, debounceMs + 200),
    [validate, debounceMs, enableValidation]
  );

  // Main calculate function with auto-validation
  const calculate = useCallback((invoiceData) => {
    debouncedCalculate(invoiceData);
    debouncedValidate(invoiceData);
  }, [debouncedCalculate, debouncedValidate]);

  // Reset functions
  const resetCalculation = useCallback(() => {
    setCalculationData(null);
    setCalculationError(null);
  }, []);

  const resetValidation = useCallback(() => {
    setValidationData(null);
    setValidationError(null);
  }, []);

  const resetCredit = useCallback(() => {
    setCreditData(null);
    setCreditError(null);
  }, []);

  return {
    // Main calculation function
    calculate,
    calculateImmediate,
    validate,
    checkCredit,
    
    // Loading states
    isCalculating,
    isValidating,
    isCheckingCredit,
    
    // Data
    calculationData,
    validationData,
    creditData,
    
    // Errors
    calculationError,
    validationError,
    creditError,
    
    // Reset functions
    resetCalculation,
    resetValidation,
    resetCredit,
    
    // Status flags
    hasCalculationError: !!calculationError,
    hasValidationError: !!validationError,
    hasCreditError: !!creditError,
    
    // Success flags
    calculationSuccess: !!calculationData && !calculationError,
    validationSuccess: !!validationData && !validationError,
    creditSuccess: !!creditData && !creditError
  };
};

/**
 * Hook for invoice draft management (simple version)
 * @returns {Object} Draft management methods
 */
export const useInvoiceDrafts = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [saveError, setSaveError] = useState(null);

  // Save draft
  const saveDraft = useCallback(async (draftData) => {
    setIsSaving(true);
    setSaveError(null);
    
    try {
      const result = await InvoiceApiService.saveDraft(draftData);
      
      if (result.success) {
        // Refresh drafts list
        const draftsResult = await InvoiceApiService.getDrafts();
        if (draftsResult.success) {
          setDrafts(draftsResult.data.drafts || []);
        }
      } else {
        setSaveError(result.error);
      }
    } catch (error) {
      setSaveError(error);
    } finally {
      setIsSaving(false);
    }
  }, []);

  // Auto-save with debounce
  const autoSave = useMemo(
    () => debounce((draftData) => {
      saveDraft(draftData);
    }, 2000),
    [saveDraft]
  );

  // Fetch drafts
  const refetchDrafts = useCallback(async () => {
    try {
      const result = await InvoiceApiService.getDrafts();
      if (result.success) {
        setDrafts(result.data.drafts || []);
      }
    } catch (error) {
      console.error('Failed to fetch drafts:', error);
    }
  }, []);

  return {
    // Save functions
    saveDraft,
    autoSave,
    
    // Draft data
    drafts,
    
    // Loading states
    isSaving,
    isDraftsLoading: false,
    
    // Errors
    saveError,
    draftsError: null,
    
    // Utility functions
    refetchDrafts,
    resetSave: () => setSaveError(null)
  };
};

/**
 * Hook for company settings (simple version)
 * @returns {Object} Company settings data
 */
export const useCompanySettings = () => {
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await InvoiceApiService.getCompanySettings();
      
      if (result.success) {
        setSettings(result.data);
      } else {
        setError(result.error);
      }
    } catch (error) {
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize settings on first use
  const getGSTIN = useCallback(() => {
    if (!settings && !isLoading) {
      fetchSettings();
    }
    return settings?.secure?.gstin || '';
  }, [settings, isLoading, fetchSettings]);

  const getStateCode = useCallback(() => {
    if (!settings && !isLoading) {
      fetchSettings();
    }
    return settings?.secure?.state_code || '';
  }, [settings, isLoading, fetchSettings]);

  const getCompanyName = useCallback(() => {
    if (!settings && !isLoading) {
      fetchSettings();
    }
    return settings?.public?.company_name || '';
  }, [settings, isLoading, fetchSettings]);

  const getAddress = useCallback(() => {
    if (!settings && !isLoading) {
      fetchSettings();
    }
    return settings?.public?.address || '';
  }, [settings, isLoading, fetchSettings]);

  return {
    // Settings data
    publicSettings: settings?.public || {},
    secureSettings: settings?.secure || {},
    
    // Loading and error states
    isLoading,
    error,
    
    // Utility functions
    refetch: fetchSettings,
    
    // Helper functions
    getGSTIN,
    getStateCode,
    getCompanyName,
    getAddress
  };
};