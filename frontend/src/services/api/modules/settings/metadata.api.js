/**
 * Metadata API Module
 * Fetches various options and configurations for dropdowns and forms
 * 
 * ENDPOINTS: /metadata (backend: app/api/routes/metadata.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
  BASE: '/metadata',
  ALL: '/metadata/all',
  PACK_TYPES: '/metadata/pack-types',
  PAYMENT_TERMS: '/metadata/payment-terms',
  PAYMENT_MODES: '/metadata/payment-modes',
  DOCUMENT_STATUSES: '/metadata/document-statuses',
  UNITS: '/metadata/units-of-measure',
  RETURN_REASONS: '/metadata/return-reasons',
  TAX_TYPES: '/metadata/tax-types',
  TRANSPORT_MODES: '/metadata/transport-modes',
  CREDIT_PLANS: '/metadata/credit-plans',
  CREDIT_RATINGS: '/metadata/credit-ratings',
  CREDIT_DAYS: '/metadata/credit-days'
};

export const metadataApi = {
  // =========================================================================
  // ALL METADATA
  // =========================================================================

  // Get all metadata in one call
  getAll: () => {
    return apiHelpers.get(ENDPOINTS.ALL);
  },

  // =========================================================================
  // INDIVIDUAL METADATA
  // =========================================================================

  // Pack Types
  getPackTypes: () => {
    return apiHelpers.get(ENDPOINTS.PACK_TYPES);
  },

  // Payment Terms
  getPaymentTerms: () => {
    return apiHelpers.get(ENDPOINTS.PAYMENT_TERMS);
  },

  // Payment Modes
  getPaymentModes: () => {
    return apiHelpers.get(ENDPOINTS.PAYMENT_MODES);
  },

  // Document Statuses
  getDocumentStatuses: () => {
    return apiHelpers.get(ENDPOINTS.DOCUMENT_STATUSES);
  },

  // Units of Measure
  getUnitsOfMeasure: () => {
    return apiHelpers.get(ENDPOINTS.UNITS);
  },

  // Return Reasons
  getReturnReasons: () => {
    return apiHelpers.get(ENDPOINTS.RETURN_REASONS);
  },

  // Tax Types
  getTaxTypes: () => {
    return apiHelpers.get(ENDPOINTS.TAX_TYPES);
  },

  // Transport Modes
  getTransportModes: () => {
    return apiHelpers.get(ENDPOINTS.TRANSPORT_MODES);
  },

  // =========================================================================
  // CREDIT CONFIGURATION
  // =========================================================================

  // Credit Plans
  getCreditPlans: () => {
    return apiHelpers.get(ENDPOINTS.CREDIT_PLANS);
  },

  // Credit Ratings
  getCreditRatings: () => {
    return apiHelpers.get(ENDPOINTS.CREDIT_RATINGS);
  },

  // Credit Days
  getCreditDays: () => {
    return apiHelpers.get(ENDPOINTS.CREDIT_DAYS);
  }
};