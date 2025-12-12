/**
 * GST API Module
 * Handles GST returns, reconciliation, and compliance
 * 
 * ENDPOINTS: /gst (backend: app/api/routes/compliance/gst.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
  BASE: '/gst',
  DASHBOARD: '/gst/dashboard',
  METRICS: '/gst/metrics',
  RETURNS: '/gst/returns',
  SETTINGS: '/gst/settings',
  TAX_RATES: '/gst/tax-rates',
  CALCULATE: '/gst/calculate',
  COMPLIANCE: '/gst/compliance',
  RECONCILIATION: '/gst/reconciliation',
  REPORTS: '/reports/tax'
};

export const gstApi = {
  // =========================================================================
  // DASHBOARD & METRICS
  // =========================================================================

  dashboard: {
    getSummary: (period) => {
      return apiHelpers.get(ENDPOINTS.DASHBOARD, { params: { period } });
    },

    getMetrics: (filters = {}) => {
      return apiHelpers.get(ENDPOINTS.METRICS, { params: filters });
    }
  },

  // =========================================================================
  // GST RETURNS
  // =========================================================================

  returns: {
    getList: (filters = {}) => {
      return apiHelpers.get(ENDPOINTS.RETURNS, { params: filters });
    },

    getStatus: (period) => {
      return apiHelpers.get(`${ENDPOINTS.RETURNS}/status`, { params: { period } });
    },

    fileReturn: (returnType, data) => {
      return apiHelpers.post(`${ENDPOINTS.RETURNS}/${returnType}`, data);
    }
  },

  // =========================================================================
  // GSTR REPORTS
  // =========================================================================

  reports: {
    gstr1: (filters = {}) => {
      return apiHelpers.get(`${ENDPOINTS.REPORTS}/gstr1`, { params: filters });
    },

    gstr3b: (filters = {}) => {
      return apiHelpers.get(`${ENDPOINTS.REPORTS}/gstr3b`, { params: filters });
    },

    gstr2a: (filters = {}) => {
      return apiHelpers.get(`${ENDPOINTS.BASE}/reports/tax/gstr2a`, { params: filters });
    },

    hsnSummary: (filters = {}) => {
      return apiHelpers.get(`${ENDPOINTS.REPORTS}/hsn`, { params: filters });
    },

    creditDebitNotes: (filters = {}) => {
      return apiHelpers.get(`${ENDPOINTS.BASE}/reports/credit-debit-notes`, { params: filters });
    }
  },

  // =========================================================================
  // RECONCILIATION
  // =========================================================================

  reconciliation: {
    getStatus: (period) => {
      return apiHelpers.get(`${ENDPOINTS.RECONCILIATION}/status`, { params: { period } });
    },

    getDetails: (period) => {
      return apiHelpers.get(`${ENDPOINTS.RECONCILIATION}/details`, { params: { period } });
    },

    reconcile: (data) => {
      return apiHelpers.post(`${ENDPOINTS.RECONCILIATION}/reconcile`, data);
    }
  },

  // =========================================================================
  // SETTINGS
  // =========================================================================

  settings: {
    getConfig: () => {
      return apiHelpers.get(ENDPOINTS.SETTINGS);
    },

    updateConfig: (config) => {
      return apiHelpers.put(ENDPOINTS.SETTINGS, config);
    },

    getTaxRates: () => {
      return apiHelpers.get(ENDPOINTS.TAX_RATES);
    }
  },

  // =========================================================================
  // TAX CALCULATIONS
  // =========================================================================

  calculate: {
    getTaxAmount: (amount, hsnCode, isInterstate = false) => {
      return apiHelpers.post(ENDPOINTS.CALCULATE, { amount, hsnCode, isInterstate });
    }
  },

  // =========================================================================
  // COMPLIANCE
  // =========================================================================

  compliance: {
    getStatus: () => {
      return apiHelpers.get(`${ENDPOINTS.COMPLIANCE}/status`);
    },

    getDueDates: () => {
      return apiHelpers.get(`${ENDPOINTS.COMPLIANCE}/due-dates`);
    }
  }
};

export default gstApi;