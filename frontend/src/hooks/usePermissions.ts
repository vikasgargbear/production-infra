/**
 * usePermissions Hook
 * Provides permission checking based on user's role from the database.
 * Fetches effective permissions on mount and caches them.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { roleManagementApi } from '../services/api';

interface PermissionState {
  permissions: Record<string, Record<string, boolean>>;
  modules: string[];
  dataAccessLevel: string;
  isAdmin: boolean;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook that fetches and caches the current user's effective permissions
 * from the backend role system.
 */
export const usePermissions = () => {
  const { user, isAuthenticated } = useAuth();
  const [state, setState] = useState<PermissionState>({
    permissions: {},
    modules: [],
    dataAccessLevel: 'own',
    isAdmin: false,
    isLoading: true,
    error: null,
  });
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user?.user_id || fetchedRef.current) {
      if (!isAuthenticated) {
        setState(prev => ({ ...prev, isLoading: false }));
      }
      return;
    }

    const fetchPermissions = async () => {
      try {
        const response = await roleManagementApi.getUserPermissions(user.user_id);
        const data: any = response?.data?.data || response?.data;

        if (!data) {
          // No role assigned — fall back to read-only
          setState({
            permissions: {},
            modules: [],
            dataAccessLevel: 'own',
            isAdmin: false,
            isLoading: false,
            error: null,
          });
          return;
        }

        // Admin shortcut: backend returns { all: true }
        if (data.all === true) {
          setState({
            permissions: { all: { all: true } },
            modules: ['sales', 'purchase', 'inventory', 'payment', 'reports', 'master', 'gst', 'returns', 'ledger', 'notes'],
            dataAccessLevel: 'organization',
            isAdmin: true,
            isLoading: false,
            error: null,
          });
          fetchedRef.current = true;
          return;
        }

        setState({
          permissions: data.permissions || {},
          modules: data.modules || [],
          dataAccessLevel: data.data_access_level || 'own',
          isAdmin: false,
          isLoading: false,
          error: null,
        });
        fetchedRef.current = true;
      } catch (err: any) {
        console.warn('[usePermissions] Failed to fetch permissions:', err.message);
        // Don't block UI — fall back to permissive for now
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to load permissions',
        }));
      }
    };

    fetchPermissions();
  }, [isAuthenticated, user?.user_id]);

  /**
   * Check if the current user has a specific permission on a module.
   */
  const hasPermission = useCallback(
    (module: string, permission: string): boolean => {
      if (state.isLoading) return true; // Don't block while loading
      if (state.isAdmin) return true;
      return state.permissions?.[module]?.[permission] === true;
    },
    [state.isAdmin, state.isLoading, state.permissions]
  );

  /**
   * Check if the current user has access to a module at all.
   */
  const hasModuleAccess = useCallback(
    (module: string): boolean => {
      if (state.isLoading) return true;
      if (state.isAdmin) return true;
      return state.modules.includes(module);
    },
    [state.isAdmin, state.isLoading, state.modules]
  );

  return {
    hasPermission,
    hasModuleAccess,
    permissions: state.permissions,
    modules: state.modules,
    dataAccessLevel: state.dataAccessLevel,
    isAdmin: state.isAdmin,
    isLoading: state.isLoading,
    error: state.error,
  };
};

export default usePermissions;
