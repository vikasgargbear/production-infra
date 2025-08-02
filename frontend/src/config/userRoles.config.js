// User Roles and Permissions Configuration
// Centralized configuration for all user roles and their permissions

export const USER_ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  BILLING: 'billing',
  STORE: 'store',
  ACCOUNTING: 'accounting',
  READONLY: 'readonly'
};

export const MODULES = {
  SALES: 'sales',
  PURCHASE: 'purchase',
  INVENTORY: 'inventory',
  PAYMENT: 'payment',
  REPORTS: 'reports',
  MASTER: 'master',
  GST: 'gst',
  RETURNS: 'returns',
  LEDGER: 'ledger',
  NOTES: 'notes'
};

export const PERMISSIONS = {
  CREATE: 'create',
  VIEW: 'view',
  EDIT: 'edit',
  DELETE: 'delete',
  APPROVE: 'approve',
  EXPORT: 'export'
};

// Role-based default permissions
export const ROLE_PERMISSIONS = {
  [USER_ROLES.ADMIN]: {
    modules: Object.values(MODULES),
    permissions: {
      [MODULES.SALES]: { create: true, view: true, edit: true, delete: true, approve: true, export: true },
      [MODULES.PURCHASE]: { create: true, view: true, edit: true, delete: true, approve: true, export: true },
      [MODULES.INVENTORY]: { create: true, view: true, edit: true, delete: true, approve: true, export: true },
      [MODULES.PAYMENT]: { create: true, view: true, edit: true, delete: true, approve: true, export: true },
      [MODULES.REPORTS]: { create: true, view: true, edit: true, delete: true, approve: true, export: true },
      [MODULES.MASTER]: { create: true, view: true, edit: true, delete: true, approve: true, export: true },
      [MODULES.GST]: { create: true, view: true, edit: true, delete: true, approve: true, export: true },
      [MODULES.RETURNS]: { create: true, view: true, edit: true, delete: true, approve: true, export: true },
      [MODULES.LEDGER]: { create: true, view: true, edit: true, delete: true, approve: true, export: true },
      [MODULES.NOTES]: { create: true, view: true, edit: true, delete: true, approve: true, export: true }
    }
  },
  
  [USER_ROLES.MANAGER]: {
    modules: [
      MODULES.SALES, MODULES.PURCHASE, MODULES.INVENTORY, 
      MODULES.PAYMENT, MODULES.REPORTS, MODULES.RETURNS, 
      MODULES.LEDGER, MODULES.NOTES
    ],
    permissions: {
      [MODULES.SALES]: { create: true, view: true, edit: true, delete: false, approve: true, export: true },
      [MODULES.PURCHASE]: { create: true, view: true, edit: true, delete: false, approve: true, export: true },
      [MODULES.INVENTORY]: { create: true, view: true, edit: true, delete: false, approve: false, export: true },
      [MODULES.PAYMENT]: { create: true, view: true, edit: true, delete: false, approve: true, export: true },
      [MODULES.REPORTS]: { create: false, view: true, edit: false, delete: false, approve: false, export: true },
      [MODULES.RETURNS]: { create: true, view: true, edit: true, delete: false, approve: true, export: true },
      [MODULES.LEDGER]: { create: false, view: true, edit: false, delete: false, approve: false, export: true },
      [MODULES.NOTES]: { create: true, view: true, edit: true, delete: false, approve: false, export: true }
    }
  },
  
  [USER_ROLES.BILLING]: {
    modules: [MODULES.SALES, MODULES.PAYMENT, MODULES.REPORTS, MODULES.RETURNS],
    permissions: {
      [MODULES.SALES]: { create: true, view: true, edit: false, delete: false, approve: false, export: true },
      [MODULES.PAYMENT]: { create: true, view: true, edit: false, delete: false, approve: false, export: true },
      [MODULES.REPORTS]: { create: false, view: true, edit: false, delete: false, approve: false, export: true },
      [MODULES.RETURNS]: { create: true, view: true, edit: false, delete: false, approve: false, export: false }
    }
  },
  
  [USER_ROLES.STORE]: {
    modules: [MODULES.INVENTORY, MODULES.PURCHASE, MODULES.REPORTS],
    permissions: {
      [MODULES.INVENTORY]: { create: true, view: true, edit: true, delete: false, approve: false, export: true },
      [MODULES.PURCHASE]: { create: true, view: true, edit: true, delete: false, approve: false, export: true },
      [MODULES.REPORTS]: { create: false, view: true, edit: false, delete: false, approve: false, export: true }
    }
  },
  
  [USER_ROLES.ACCOUNTING]: {
    modules: [MODULES.PAYMENT, MODULES.LEDGER, MODULES.REPORTS, MODULES.GST, MODULES.NOTES],
    permissions: {
      [MODULES.PAYMENT]: { create: true, view: true, edit: true, delete: false, approve: true, export: true },
      [MODULES.LEDGER]: { create: true, view: true, edit: true, delete: false, approve: false, export: true },
      [MODULES.REPORTS]: { create: false, view: true, edit: false, delete: false, approve: false, export: true },
      [MODULES.GST]: { create: true, view: true, edit: true, delete: false, approve: true, export: true },
      [MODULES.NOTES]: { create: true, view: true, edit: true, delete: false, approve: false, export: true }
    }
  },
  
  [USER_ROLES.READONLY]: {
    modules: Object.values(MODULES),
    permissions: Object.values(MODULES).reduce((acc, module) => ({
      ...acc,
      [module]: { create: false, view: true, edit: false, delete: false, approve: false, export: false }
    }), {})
  }
};

// Module display information
export const MODULE_INFO = {
  [MODULES.SALES]: { name: 'Sales', icon: '💰', color: 'blue' },
  [MODULES.PURCHASE]: { name: 'Purchase', icon: '🛒', color: 'green' },
  [MODULES.INVENTORY]: { name: 'Inventory', icon: '📦', color: 'orange' },
  [MODULES.PAYMENT]: { name: 'Payment', icon: '💳', color: 'purple' },
  [MODULES.REPORTS]: { name: 'Reports', icon: '📊', color: 'cyan' },
  [MODULES.MASTER]: { name: 'Master', icon: '⚙️', color: 'gray' },
  [MODULES.GST]: { name: 'GST', icon: '🧮', color: 'indigo' },
  [MODULES.RETURNS]: { name: 'Returns', icon: '↩️', color: 'red' },
  [MODULES.LEDGER]: { name: 'Ledger', icon: '📒', color: 'yellow' },
  [MODULES.NOTES]: { name: 'Notes', icon: '📝', color: 'pink' }
};

// Role display information
export const ROLE_INFO = {
  [USER_ROLES.ADMIN]: { label: 'Administrator', color: 'red', description: 'Full system access' },
  [USER_ROLES.MANAGER]: { label: 'Manager', color: 'purple', description: 'Manage operations' },
  [USER_ROLES.BILLING]: { label: 'Billing Staff', color: 'blue', description: 'Sales and billing' },
  [USER_ROLES.STORE]: { label: 'Store Keeper', color: 'green', description: 'Inventory management' },
  [USER_ROLES.ACCOUNTING]: { label: 'Accountant', color: 'orange', description: 'Financial operations' },
  [USER_ROLES.READONLY]: { label: 'Read Only', color: 'gray', description: 'View only access' }
};

// Permission helper functions
export const hasPermission = (userPermissions, module, permission) => {
  return userPermissions?.[module]?.[permission] || false;
};

export const hasModuleAccess = (userModules, module) => {
  return userModules?.includes(module) || userModules?.includes('all');
};

export const getRoleDefaults = (role) => {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[USER_ROLES.READONLY];
};

export default {
  USER_ROLES,
  MODULES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  MODULE_INFO,
  ROLE_INFO,
  hasPermission,
  hasModuleAccess,
  getRoleDefaults
};