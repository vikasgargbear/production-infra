/**
 * PermissionGate — Declarative permission boundary component.
 *
 * Wraps children and only renders them when the current user holds the
 * required module+permission.  Falls back to `fallback` (default: null)
 * when the check fails.
 *
 * Usage:
 *   <PermissionGate module="sales" permission="create">
 *     <CreateInvoiceButton />
 *   </PermissionGate>
 */
import React from 'react';
import { usePermissions } from '../../../hooks/usePermissions';

interface PermissionGateProps {
  /** The module key (e.g. "sales", "purchase", "master") */
  module: string;
  /** The permission type (e.g. "view", "create", "edit", "delete") */
  permission: string;
  /** What to render when the user lacks the permission (default: nothing) */
  fallback?: React.ReactNode;
  /** Content to show when the user has the required permission */
  children: React.ReactNode;
}

const PermissionGate: React.FC<PermissionGateProps> = ({
  module,
  permission,
  fallback = null,
  children,
}) => {
  const { hasPermission, isLoading } = usePermissions();

  // Never expose protected actions while authorization is unresolved.
  if (isLoading) {
    return <>{fallback}</>;
  }

  if (!hasPermission(module, permission)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

export default PermissionGate;
