import apiClient from '../apiClient';

export const settingsApi = {
  // Tax Master APIs (tax_entries table)
  taxes: {
    getAll: () => apiClient.get('/tax-entries'),
    getById: (id) => apiClient.get(`/tax-entries/${id}`),
    create: (data) => apiClient.post('/tax-entries', data),
    update: (id, data) => apiClient.put(`/tax-entries/${id}`, data),
    delete: (id) => apiClient.delete(`/tax-entries/${id}`),
    getByHSN: (hsn) => apiClient.get(`/tax-entries/hsn/${hsn}`),
    getTaxTypes: () => apiClient.get('/tax-entries/types'),
  },

  // System Settings APIs
  system: {
    getAll: () => apiClient.get('/settings/system'),
    getByCategory: (category) => apiClient.get(`/settings/system/${category}`),
    update: (data) => apiClient.put('/settings/system', data),
    reset: (category) => apiClient.post(`/settings/system/${category}/reset`),
  },

  // Feature Settings APIs
  features: {
    getAll: () => apiClient.get('/settings/features'),
    getByModule: (module) => apiClient.get(`/settings/features/${module}`),
    toggle: (featureId, enabled) => apiClient.patch(`/settings/features/${featureId}`, { enabled }),
    bulkUpdate: (updates) => apiClient.put('/settings/features/bulk', updates),
  },

  // Unit Master APIs (units_of_measure table)
  units: {
    getAll: () => apiClient.get('/units-of-measure'),
    getById: (id) => apiClient.get(`/units-of-measure/${id}`),
    getByCategory: (category) => apiClient.get(`/units-of-measure/category/${category}`),
    create: (data) => apiClient.post('/units-of-measure', data),
    update: (id, data) => apiClient.put(`/units-of-measure/${id}`, data),
    delete: (id) => apiClient.delete(`/units-of-measure/${id}`),
    getConversions: (fromUnit, toUnit) => apiClient.get(`/units-of-measure/convert/${fromUnit}/${toUnit}`),
  },

  // Warehouse/Location APIs (storage_locations table)
  warehouses: {
    getAll: () => apiClient.get('/storage-locations'),
    getById: (id) => apiClient.get(`/storage-locations/${id}`),
    getByType: (type) => apiClient.get(`/storage-locations/type/${type}`),
    create: (data) => apiClient.post('/storage-locations', data),
    update: (id, data) => apiClient.put(`/storage-locations/${id}`, data),
    delete: (id) => apiClient.delete(`/storage-locations/${id}`),
    setDefault: (id) => apiClient.post(`/storage-locations/${id}/set-default`),
    getStock: (id) => apiClient.get(`/storage-locations/${id}/stock`),
    getCapacity: (id) => apiClient.get(`/storage-locations/${id}/capacity`),
  },

  // Batch Master APIs
  batches: {
    getAll: (filters) => apiClient.get('/batches', { params: filters }),
    getById: (id) => apiClient.get(`/batches/${id}`),
    getByProduct: (productId) => apiClient.get(`/batches/product/${productId}`),
    getExpiring: (days) => apiClient.get(`/batches/expiring/${days}`),
    create: (data) => apiClient.post('/batches', data),
    update: (id, data) => apiClient.put(`/batches/${id}`, data),
    delete: (id) => apiClient.delete(`/batches/${id}`),
    adjustQuantity: (id, adjustment) => apiClient.post(`/batches/${id}/adjust`, adjustment),
    getMovements: (id) => apiClient.get(`/batches/${id}/movements`),
  },

  // User Management APIs - Updated for org_users table
  users: {
    getAll: () => apiClient.get('/org-users/'),
    getById: (id) => apiClient.get(`/org-users/${id}/`),
    create: (data) => apiClient.post('/org-users/', data),
    update: (id, data) => apiClient.put(`/org-users/${id}/`, data),
    delete: (id) => apiClient.delete(`/org-users/${id}/`),
    changePassword: (id, passwords) => apiClient.post(`/org-users/${id}/change-password/`, passwords),
    resetPassword: (id) => apiClient.post(`/org-users/${id}/reset-password/`),
    updatePermissions: (id, permissions) => apiClient.put(`/org-users/${id}/permissions/`, permissions),
    getRoles: () => apiClient.get('/org-users/roles/'),
    getPermissions: () => apiClient.get('/org-users/permissions/'),
  },

  // Notification & Alert APIs
  notifications: {
    getAll: (filters) => apiClient.get('/notifications', { params: filters }),
    getUnread: () => apiClient.get('/notifications/unread'),
    markAsRead: (id) => apiClient.patch(`/notifications/${id}/read`),
    markAllAsRead: () => apiClient.post('/notifications/mark-all-read'),
    delete: (id) => apiClient.delete(`/notifications/${id}`),
    
    // Alert Rules
    rules: {
      getAll: () => apiClient.get('/notifications/rules'),
      getById: (id) => apiClient.get(`/notifications/rules/${id}`),
      create: (data) => apiClient.post('/notifications/rules', data),
      update: (id, data) => apiClient.put(`/notifications/rules/${id}`, data),
      delete: (id) => apiClient.delete(`/notifications/rules/${id}`),
      toggle: (id, enabled) => apiClient.patch(`/notifications/rules/${id}/toggle`, { enabled }),
      test: (id) => apiClient.post(`/notifications/rules/${id}/test`),
    },
    
    // Preferences
    preferences: {
      get: () => apiClient.get('/notifications/preferences'),
      update: (data) => apiClient.put('/notifications/preferences', data),
    },
  },

  // Third-Party Integration APIs
  integrations: {
    getAll: () => apiClient.get('/integrations'),
    getById: (id) => apiClient.get(`/integrations/${id}`),
    getByType: (type) => apiClient.get(`/integrations/type/${type}`),
    configure: (id, config) => apiClient.put(`/integrations/${id}/configure`, config),
    test: (id) => apiClient.post(`/integrations/${id}/test`),
    enable: (id) => apiClient.post(`/integrations/${id}/enable`),
    disable: (id) => apiClient.post(`/integrations/${id}/disable`),
    getLogs: (id, filters) => apiClient.get(`/integrations/${id}/logs`, { params: filters }),
    
    // Specific integrations
    whatsapp: {
      sendMessage: (data) => apiClient.post('/integrations/whatsapp/send', data),
      getTemplates: () => apiClient.get('/integrations/whatsapp/templates'),
    },
    tally: {
      sync: (options) => apiClient.post('/integrations/tally/sync', options),
      getStatus: () => apiClient.get('/integrations/tally/status'),
      getMappings: () => apiClient.get('/integrations/tally/mappings'),
      updateMappings: (mappings) => apiClient.put('/integrations/tally/mappings', mappings),
    },
    sms: {
      sendSMS: (data) => apiClient.post('/integrations/sms/send', data),
      getBalance: () => apiClient.get('/integrations/sms/balance'),
    },
  },
};

export default settingsApi;