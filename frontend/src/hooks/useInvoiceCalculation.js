/**
 * Invoice Calculation Hook
 * Provides real-time invoice calculations using backend APIs
 * Replaces client-side InvoiceCalculator with secure backend calculations
 */

import { useMutation, useQuery, useQueryClient } from 'react-query';
import { useMemo, useCallback } from 'react';
import { debounce } from 'lodash';
import InvoiceApiService from '../services/invoiceApiService';

/**
 * Hook for real-time invoice calculations
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

  // Real-time calculation mutation
  const calculationMutation = useMutation(
    (invoiceData) => InvoiceApiService.calculateInvoice(invoiceData),
    {
      onSuccess: (data) => {
        if (data.success) {
          onSuccess?.(data.data);
        } else {
          onError?.(data.error);
        }
      },
      onError: (error) => {
        console.error('Calculation failed:', error);
        onError?.(error);
      }
    }
  );

  // Validation mutation
  const validationMutation = useMutation(
    (invoiceData) => InvoiceApiService.validateInvoice(invoiceData),
    {
      onError: (error) => {
        console.error('Validation failed:', error);
      }
    }
  );

  // Credit check mutation
  const creditCheckMutation = useMutation(
    ({ customerId, amount }) => InvoiceApiService.checkCustomerCredit(customerId, amount),
    {
      onError: (error) => {
        console.error('Credit check failed:', error);
      }
    }
  );

  // Debounced calculation function
  const debouncedCalculate = useMemo(
    () => debounce((invoiceData) => {
      if (invoiceData.items && invoiceData.items.length > 0) {
        calculationMutation.mutate(invoiceData);
      }
    }, debounceMs),
    [calculationMutation.mutate, debounceMs]
  );

  // Debounced validation function
  const debouncedValidate = useMemo(
    () => debounce((invoiceData) => {
      if (enableValidation && invoiceData.items && invoiceData.items.length > 0) {
        validationMutation.mutate(invoiceData);
      }
    }, debounceMs + 200), // Slightly longer delay for validation
    [validationMutation.mutate, debounceMs, enableValidation]
  );

  // Calculate invoice with automatic validation
  const calculate = useCallback((invoiceData) => {
    debouncedCalculate(invoiceData);
    debouncedValidate(invoiceData);
  }, [debouncedCalculate, debouncedValidate]);

  // Validate only
  const validate = useCallback((invoiceData) => {
    validationMutation.mutate(invoiceData);
  }, [validationMutation.mutate]);

  // Check customer credit
  const checkCredit = useCallback((customerId, amount) => {
    creditCheckMutation.mutate({ customerId, amount });
  }, [creditCheckMutation.mutate]);

  // Force immediate calculation (no debounce)
  const calculateImmediate = useCallback((invoiceData) => {
    calculationMutation.mutate(invoiceData);
    if (enableValidation) {
      validationMutation.mutate(invoiceData);
    }
  }, [calculationMutation.mutate, validationMutation.mutate, enableValidation]);

  return {
    // Main calculation function
    calculate,
    calculateImmediate,
    validate,
    checkCredit,
    
    // Loading states
    isCalculating: calculationMutation.isLoading,
    isValidating: validationMutation.isLoading,
    isCheckingCredit: creditCheckMutation.isLoading,
    
    // Data
    calculationData: calculationMutation.data,
    validationData: validationMutation.data,
    creditData: creditCheckMutation.data,
    
    // Errors
    calculationError: calculationMutation.error,
    validationError: validationMutation.error,
    creditError: creditCheckMutation.error,
    
    // Reset functions
    resetCalculation: calculationMutation.reset,
    resetValidation: validationMutation.reset,
    resetCredit: creditCheckMutation.reset,
    
    // Status flags
    hasCalculationError: calculationMutation.isError,
    hasValidationError: validationMutation.isError,
    hasCreditError: creditCheckMutation.isError,
    
    // Success flags
    calculationSuccess: calculationMutation.isSuccess && calculationMutation.data?.success,
    validationSuccess: validationMutation.isSuccess && validationMutation.data?.success,
    creditSuccess: creditCheckMutation.isSuccess && creditCheckMutation.data?.success
  };
};

/**
 * Hook for invoice draft management
 * @returns {Object} Draft management methods
 */
export const useInvoiceDrafts = () => {
  const queryClient = useQueryClient();
  
  // Save draft mutation
  const saveDraftMutation = useMutation(
    (draftData) => InvoiceApiService.saveDraft(draftData),
    {
      onSuccess: (data) => {
        if (data.success) {
          // Invalidate drafts query to refresh list
          queryClient.invalidateQueries('invoice-drafts');
        }
      }
    }
  );

  // Get drafts query
  const {
    data: draftsData,
    isLoading: isDraftsLoading,
    error: draftsError,
    refetch: refetchDrafts
  } = useQuery(
    'invoice-drafts',
    () => InvoiceApiService.getDrafts(),
    {
      retry: 1,
      staleTime: 5 * 60 * 1000 // 5 minutes
    }
  );

  // Auto-save function with debounce
  const autoSave = useMemo(
    () => debounce((draftData) => {
      saveDraftMutation.mutate(draftData);
    }, 2000), // 2 second delay for auto-save
    [saveDraftMutation.mutate]
  );

  return {
    // Save functions
    saveDraft: saveDraftMutation.mutate,
    autoSave,
    
    // Draft data
    drafts: draftsData?.data?.drafts || [],
    
    // Loading states
    isSaving: saveDraftMutation.isLoading,
    isDraftsLoading,
    
    // Errors
    saveError: saveDraftMutation.error,
    draftsError,
    
    // Utility functions
    refetchDrafts,
    resetSave: saveDraftMutation.reset
  };
};

/**
 * Hook for invoice number generation
 * @returns {Object} Number generation methods
 */
export const useInvoiceNumber = () => {
  const generateNumberMutation = useMutation(
    (options) => InvoiceApiService.generateInvoiceNumber(options),
    {
      onError: (error) => {
        console.error('Invoice number generation failed:', error);
      }
    }
  );

  return {
    generateNumber: generateNumberMutation.mutate,
    generatedNumber: generateNumberMutation.data?.data,
    isGenerating: generateNumberMutation.isLoading,
    generateError: generateNumberMutation.error,
    resetGenerate: generateNumberMutation.reset
  };
};

/**
 * Hook for company settings with security
 * @returns {Object} Company settings data
 */
export const useCompanySettings = () => {
  const {
    data: settingsData,
    isLoading,
    error,
    refetch
  } = useQuery(
    'company-settings',
    () => InvoiceApiService.getCompanySettings(),
    {
      retry: 1,
      staleTime: 10 * 60 * 1000, // 10 minutes cache
      cacheTime: 30 * 60 * 1000  // 30 minutes
    }
  );

  return {
    // Split settings data
    publicSettings: settingsData?.data?.public || {},
    secureSettings: settingsData?.data?.secure || {},
    
    // Loading and error states
    isLoading,
    error,
    
    // Utility functions
    refetch,
    
    // Helper functions
    getGSTIN: () => settingsData?.data?.secure?.gstin || '',
    getStateCode: () => settingsData?.data?.secure?.state_code || '',
    getCompanyName: () => settingsData?.data?.public?.company_name || '',
    getAddress: () => settingsData?.data?.public?.address || ''
  };
};

/**
 * Hook for enhanced search functionality
 * @returns {Object} Search methods
 */
export const useEnhancedSearch = () => {
  // Product search mutation
  const productSearchMutation = useMutation(
    (searchParams) => InvoiceApiService.searchProductsEnhanced(searchParams)
  );

  // Customer search mutation
  const customerSearchMutation = useMutation(
    (searchParams) => InvoiceApiService.searchCustomersEnhanced(searchParams)
  );

  // Debounced search functions
  const debouncedProductSearch = useMemo(
    () => debounce((searchParams) => {
      if (searchParams.query && searchParams.query.length >= 2) {
        productSearchMutation.mutate(searchParams);
      }
    }, 300),
    [productSearchMutation.mutate]
  );

  const debouncedCustomerSearch = useMemo(
    () => debounce((searchParams) => {
      if (searchParams.query && searchParams.query.length >= 2) {
        customerSearchMutation.mutate(searchParams);
      }
    }, 300),
    [customerSearchMutation.mutate]
  );

  return {
    // Search functions
    searchProducts: debouncedProductSearch,
    searchCustomers: debouncedCustomerSearch,
    
    // Search results
    productResults: productSearchMutation.data?.data?.products || [],
    customerResults: customerSearchMutation.data?.data?.customers || [],
    
    // Loading states
    isSearchingProducts: productSearchMutation.isLoading,
    isSearchingCustomers: customerSearchMutation.isLoading,
    
    // Errors
    productSearchError: productSearchMutation.error,
    customerSearchError: customerSearchMutation.error,
    
    // Reset functions
    resetProductSearch: productSearchMutation.reset,
    resetCustomerSearch: customerSearchMutation.reset
  };
};