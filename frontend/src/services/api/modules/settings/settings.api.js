/**
 * Settings API Module
 * Handles company settings, taxes, units, warehouses, users, notifications, integrations
 * 
 * ENDPOINTS: /settings, /company, /tax-entries, etc.
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
  COMPANY: '/company',
  SETTINGS: '/settings',
  TAX_ENTRIES: '/tax-entries',
  UNITS: '/units-of-measure',
  WAREHOUSES: '/storage-locations',
  FEATURES: '/settings/features',
  NOTIFICATIONS: '/notifications',
  INTEGRATIONS: '/integrations',
  ORG_USERS: '/org-users'
};

export const settingsApi = {
  // =========================================================================
  // COMPANY SETTINGS
  // =========================================================================

  getSettings: () => apiHelpers.get(`${ENDPOINTS.COMPANY}/settings`),
  updateSettings: (data) => apiHelpers.put(`${ENDPOINTS.COMPANY}/settings`, data),
  getCompanyInfo: () => apiHelpers.get(`${ENDPOINTS.COMPANY}/info`),

  // =========================================================================
  // TAX ENTRIES
  // =========================================================================

  taxes: {
    getAll: () => apiHelpers.get(ENDPOINTS.TAX_ENTRIES),
    getById: (id) => apiHelpers.get(`${ENDPOINTS.TAX_ENTRIES}/${id}`),
    create: (data) => apiHelpers.post(ENDPOINTS.TAX_ENTRIES, data),
    update: (id, data) => apiHelpers.put(`${ENDPOINTS.TAX_ENTRIES}/${id}`, data),
    delete: (id) => apiHelpers.delete(`${ENDPOINTS.TAX_ENTRIES}/${id}`),
    getByHSN: (hsn) => apiHelpers.get(`${ENDPOINTS.TAX_ENTRIES}/hsn/${hsn}`),
    getTaxTypes: () => apiHelpers.get(`${ENDPOINTS.TAX_ENTRIES}/types`)
  },

  // =========================================================================
  // SYSTEM SETTINGS
  // =========================================================================

  system: {
    getAll: () => apiHelpers.get('/system/settings'),
    getByCategory: (category) => apiHelpers.get(`/system/settings/${category}`),
    update: (data) => apiHelpers.put('/system/settings', data),
    reset: (category) => apiHelpers.post(`/system/settings/${category}/reset`)
  },

  // =========================================================================
  // FEATURES
  // =========================================================================

  features: {
    getAll: () => apiHelpers.get(ENDPOINTS.FEATURES),
    getByModule: (module) => apiHelpers.get(`${ENDPOINTS.FEATURES}/${module}`),
    toggle: (featureId, enabled) => apiHelpers.patch(`${ENDPOINTS.FEATURES}/${featureId}`, { enabled }),
    bulkUpdate: (updates) => apiHelpers.put(`${ENDPOINTS.FEATURES}/bulk`, updates)
  },

  // =========================================================================
  // UNITS OF MEASURE
  // =========================================================================

  units: {
    getAll: () => apiHelpers.get(ENDPOINTS.UNITS),
    getById: (id) => apiHelpers.get(`${ENDPOINTS.UNITS}/${id}`),
    getByCategory: (category) => apiHelpers.get(`${ENDPOINTS.UNITS}/category/${category}`),
    create: (data) => apiHelpers.post(ENDPOINTS.UNITS, data),
    update: (id, data) => apiHelpers.put(`${ENDPOINTS.UNITS}/${id}`, data),
    delete: (id) => apiHelpers.delete(`${ENDPOINTS.UNITS}/${id}`),
    getConversions: (fromUnit, toUnit) => apiHelpers.get(`${ENDPOINTS.UNITS}/convert/${fromUnit}/${toUnit}`)
  },

  // =========================================================================
  // WAREHOUSES / STORAGE LOCATIONS
  // =========================================================================

  warehouses: {
    getAll: () => apiHelpers.get(ENDPOINTS.WAREHOUSES),
    getById: (id) => apiHelpers.get(`${ENDPOINTS.WAREHOUSES}/${id}`),
    getByType: (type) => apiHelpers.get(`${ENDPOINTS.WAREHOUSES}/type/${type}`),
    create: (data) => apiHelpers.post(ENDPOINTS.WAREHOUSES, data),
    update: (id, data) => apiHelpers.put(`${ENDPOINTS.WAREHOUSES}/${id}`, data),
    delete: (id) => apiHelpers.delete(`${ENDPOINTS.WAREHOUSES}/${id}`),
    setDefault: (id) => apiHelpers.post(`${ENDPOINTS.WAREHOUSES}/${id}/set-default`),
    getStock: (id) => apiHelpers.get(`${ENDPOINTS.WAREHOUSES}/${id}/stock`),
    getCapacity: (id) => apiHelpers.get(`${ENDPOINTS.WAREHOUSES}/${id}/capacity`)
  },

  // =========================================================================
  // BATCHES
  // =========================================================================

  batches: {
    getAll: (filters = {}) => apiHelpers.get('/batches', { params: filters }),
    getById: (id) => apiHelpers.get(`/batches/${id}`),
    getByProduct: (productId) => apiHelpers.get(`/batches/product/${productId}`),
    getExpiring: (days) => apiHelpers.get(`/batches/expiring/${days}`),
    create: (data) => apiHelpers.post('/batches', data),
    update: (id, data) => apiHelpers.put(`/batches/${id}`, data),
    delete: (id) => apiHelpers.delete(`/batches/${id}`),
    adjustQuantity: (id, adjustment) => apiHelpers.post(`/batches/${id}/adjust`, adjustment),
    getMovements: (id) => apiHelpers.get(`/batches/${id}/movements`)
  },

  // =========================================================================
  // ORG USERS
  // =========================================================================

  users: {
    getAll: () => apiHelpers.get(ENDPOINTS.ORG_USERS),
    getById: (id) => apiHelpers.get(`${ENDPOINTS.ORG_USERS}/${id}`),
    create: (data) => apiHelpers.post(ENDPOINTS.ORG_USERS, data),
    update: (id, data) => apiHelpers.put(`${ENDPOINTS.ORG_USERS}/${id}`, data),
    delete: (id) => apiHelpers.delete(`${ENDPOINTS.ORG_USERS}/${id}`),
    changePassword: (id, passwords) => apiHelpers.post(`${ENDPOINTS.ORG_USERS}/${id}/change-password`, passwords),
    resetPassword: (id) => apiHelpers.post(`${ENDPOINTS.ORG_USERS}/${id}/reset-password`),
    updatePermissions: (id, permissions) => apiHelpers.put(`${ENDPOINTS.ORG_USERS}/${id}/permissions`, permissions),
    getRoles: () => apiHelpers.get(`${ENDPOINTS.ORG_USERS}/roles`),
    getPermissions: () => apiHelpers.get(`${ENDPOINTS.ORG_USERS}/permissions`)
  },

  // =========================================================================
  // NOTIFICATIONS
  // =========================================================================

  notifications: {
    getAll: (filters = {}) => apiHelpers.get(ENDPOINTS.NOTIFICATIONS, { params: filters }),
    getUnread: () => apiHelpers.get(`${ENDPOINTS.NOTIFICATIONS}/unread`),
    markAsRead: (id) => apiHelpers.patch(`${ENDPOINTS.NOTIFICATIONS}/${id}/read`),
    markAllAsRead: () => apiHelpers.post(`${ENDPOINTS.NOTIFICATIONS}/mark-all-read`),
    delete: (id) => apiHelpers.delete(`${ENDPOINTS.NOTIFICATIONS}/${id}`),

    rules: {
      getAll: () => apiHelpers.get(`${ENDPOINTS.NOTIFICATIONS}/rules`),
      getById: (id) => apiHelpers.get(`${ENDPOINTS.NOTIFICATIONS}/rules/${id}`),
      create: (data) => apiHelpers.post(`${ENDPOINTS.NOTIFICATIONS}/rules`, data),
      update: (id, data) => apiHelpers.put(`${ENDPOINTS.NOTIFICATIONS}/rules/${id}`, data),
      delete: (id) => apiHelpers.delete(`${ENDPOINTS.NOTIFICATIONS}/rules/${id}`),
      toggle: (id, enabled) => apiHelpers.patch(`${ENDPOINTS.NOTIFICATIONS}/rules/${id}/toggle`, { enabled }),
      test: (id) => apiHelpers.post(`${ENDPOINTS.NOTIFICATIONS}/rules/${id}/test`)
    },

    preferences: {
      get: () => apiHelpers.get(`${ENDPOINTS.NOTIFICATIONS}/preferences`),
      update: (data) => apiHelpers.put(`${ENDPOINTS.NOTIFICATIONS}/preferences`, data)
    }
  },

  // =========================================================================
  // INTEGRATIONS
  // =========================================================================

  integrations: {
    getAll: () => apiHelpers.get(ENDPOINTS.INTEGRATIONS),
    getById: (id) => apiHelpers.get(`${ENDPOINTS.INTEGRATIONS}/${id}`),
    getByType: (type) => apiHelpers.get(`${ENDPOINTS.INTEGRATIONS}/type/${type}`),
    configure: (id, config) => apiHelpers.put(`${ENDPOINTS.INTEGRATIONS}/${id}/configure`, config),
    test: (id) => apiHelpers.post(`${ENDPOINTS.INTEGRATIONS}/${id}/test`),
    enable: (id) => apiHelpers.post(`${ENDPOINTS.INTEGRATIONS}/${id}/enable`),
    disable: (id) => apiHelpers.post(`${ENDPOINTS.INTEGRATIONS}/${id}/disable`),
    getLogs: (id, filters = {}) => apiHelpers.get(`${ENDPOINTS.INTEGRATIONS}/${id}/logs`, { params: filters }),

    whatsapp: {
      sendMessage: (data) => apiHelpers.post(`${ENDPOINTS.INTEGRATIONS}/whatsapp/send`, data),
      getTemplates: () => apiHelpers.get(`${ENDPOINTS.INTEGRATIONS}/whatsapp/templates`)
    },
    tally: {
      sync: (options) => apiHelpers.post(`${ENDPOINTS.INTEGRATIONS}/tally/sync`, options),
      getStatus: () => apiHelpers.get(`${ENDPOINTS.INTEGRATIONS}/tally/status`),
      getMappings: () => apiHelpers.get(`${ENDPOINTS.INTEGRATIONS}/tally/mappings`),
      updateMappings: (mappings) => apiHelpers.put(`${ENDPOINTS.INTEGRATIONS}/tally/mappings`, mappings)
    },
    sms: {
      sendSMS: (data) => apiHelpers.post(`${ENDPOINTS.INTEGRATIONS}/sms/send`, data),
      getBalance: () => apiHelpers.get(`${ENDPOINTS.INTEGRATIONS}/sms/balance`)
    }
  }
};

export default settingsApi;