/** Authorization derived from the signed canonical ERP session claims. */
import { useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

const MODULE_DOMAINS: Record<string, string[]> = {
  sales: ['sales'], invoices: ['sales'], challans: ['sales'],
  purchase: ['procurement'], purchase_returns: ['procurement'],
  inventory: ['inventory'], payment: ['finance'], finance: ['finance'],
  ledger: ['finance'], notes: ['finance'], gst: ['tax'],
  returns: ['sales', 'procurement'],
  reports: ['sales', 'procurement', 'inventory', 'finance', 'tax'],
  dashboard: ['sales', 'procurement', 'inventory', 'finance', 'tax'],
  master: ['catalog', 'parties', 'hr', 'core'], settings: ['core'],
};

const ACTION_SUFFIXES: Record<string, string[]> = {
  create: ['create', 'manage'], edit: ['edit', 'manage'], delete: ['manage'],
  approve: ['approve', 'post', 'file', 'execute'],
};

export function canonicalModuleAccess(codes: string[], module: string): boolean {
  const domains = MODULE_DOMAINS[module.toLowerCase()] || [module.toLowerCase()];
  return codes.some(code => domains.includes(code.split('.', 1)[0]));
}

export function canonicalPermissionAccess(
  codes: string[], module: string, permission: string,
): boolean {
  if (!canonicalModuleAccess(codes, module)) return false;
  const action = permission.toLowerCase();
  if (action === 'view' || action === 'export') return true;
  const domains = MODULE_DOMAINS[module.toLowerCase()] || [module.toLowerCase()];
  const suffixes = ACTION_SUFFIXES[action] || [action];
  return codes.some(code => (
    domains.includes(code.split('.', 1)[0])
    && suffixes.some(suffix => code.endsWith(`.${suffix}`))
  ));
}

export const usePermissions = () => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const permissionCodes = useMemo(
    () => Object.entries(user?.permissions || {})
      .filter(([, enabled]) => enabled === true)
      .map(([code]) => code.toLowerCase()),
    [user?.permissions],
  );
  const isAdmin = user?.is_admin === true;

  const hasPermission = useCallback(
    (module: string, permission: string): boolean => (
      isAuthenticated
      && (isAdmin || canonicalPermissionAccess(permissionCodes, module, permission))
    ),
    [isAdmin, isAuthenticated, permissionCodes],
  );

  const hasModuleAccess = useCallback(
    (module: string): boolean => (
      isAuthenticated && (isAdmin || canonicalModuleAccess(permissionCodes, module))
    ),
    [isAdmin, isAuthenticated, permissionCodes],
  );

  const modules = useMemo(
    () => Object.keys(MODULE_DOMAINS).filter(module => (
      isAdmin || canonicalModuleAccess(permissionCodes, module)
    )),
    [isAdmin, permissionCodes],
  );

  return {
    hasPermission, hasModuleAccess, permissions: user?.permissions || {}, modules,
    dataAccessLevel: user?.data_access_level || 'branch', isAdmin,
    isLoading: authLoading, error: null,
  };
};

export default usePermissions;
