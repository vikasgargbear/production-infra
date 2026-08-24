import {
  canonicalModuleAccess,
  canonicalPermissionAccess,
} from './usePermissions';

describe('canonical permission mapping', () => {
  const codes = [
    'sales.invoice.create',
    'procurement.order.manage',
    'finance.payment.manage',
    'catalog.product.manage',
  ];

  it('maps navigation modules to canonical domains', () => {
    expect(canonicalModuleAccess(codes, 'sales')).toBe(true);
    expect(canonicalModuleAccess(codes, 'purchase')).toBe(true);
    expect(canonicalModuleAccess(codes, 'payment')).toBe(true);
    expect(canonicalModuleAccess(codes, 'master')).toBe(true);
    expect(canonicalModuleAccess(codes, 'inventory')).toBe(false);
  });

  it('does not grant actions while claims are missing', () => {
    expect(canonicalPermissionAccess([], 'sales', 'view')).toBe(false);
    expect(canonicalPermissionAccess(codes, 'sales', 'create')).toBe(true);
    expect(canonicalPermissionAccess(codes, 'sales', 'approve')).toBe(false);
  });
});
