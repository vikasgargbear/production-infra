import {
  canonicalModuleAccess,
  canonicalCapabilityAccess,
  canonicalAnyCapabilityAccess,
  canonicalPermissionAccess,
} from './usePermissions';
import {
  CUSTOMER_LOOKUP_CAPABILITIES,
  PRODUCT_LOOKUP_CAPABILITIES,
  SUPPLIER_LOOKUP_CAPABILITIES,
} from '../config/canonicalCapabilities';

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

  it('requires the exact signed capability for foundation mutations', () => {
    expect(canonicalCapabilityAccess(codes, 'catalog.product.manage')).toBe(true);
    expect(canonicalCapabilityAccess(codes, 'parties.customer.manage')).toBe(false);
    expect(canonicalCapabilityAccess(['parties.customer.create'], 'parties.customer.manage')).toBe(false);
  });

  it('allows workflow-specific lookup claims while denying unrelated master claims', () => {
    expect(canonicalAnyCapabilityAccess(['sales.invoice.create'], PRODUCT_LOOKUP_CAPABILITIES)).toBe(true);
    expect(canonicalAnyCapabilityAccess(['sales.invoice.create'], CUSTOMER_LOOKUP_CAPABILITIES)).toBe(true);
    expect(canonicalAnyCapabilityAccess(['procurement.order.manage'], PRODUCT_LOOKUP_CAPABILITIES)).toBe(true);
    expect(canonicalAnyCapabilityAccess(['procurement.order.manage'], SUPPLIER_LOOKUP_CAPABILITIES)).toBe(true);
    expect(canonicalAnyCapabilityAccess(['hr.employee.manage'], PRODUCT_LOOKUP_CAPABILITIES)).toBe(false);
    expect(canonicalAnyCapabilityAccess(['core.organization.manage'], CUSTOMER_LOOKUP_CAPABILITIES)).toBe(false);
    expect(canonicalAnyCapabilityAccess(['core.organization.manage'], SUPPLIER_LOOKUP_CAPABILITIES)).toBe(false);
  });

  it('keeps the reviewed frontend lookup matrices explicit', () => {
    expect(PRODUCT_LOOKUP_CAPABILITIES).toEqual([
      'catalog.product.manage',
      'sales.order.create', 'sales.order.manage', 'sales.dispatch.create', 'sales.dispatch.post',
      'sales.invoice.create', 'sales.return.create', 'sales.return.post',
      'procurement.order.manage', 'procurement.receipt.post',
      'procurement.supplier_invoice.create', 'procurement.invoice.post',
      'procurement.purchase_return.create', 'procurement.return.post',
      'inventory.adjustment.create', 'inventory.transfer.create',
      'inventory.destruction.create', 'inventory.document.post', 'inventory.batch.manage',
      'inventory.reservation.manage',
    ]);
    expect(CUSTOMER_LOOKUP_CAPABILITIES).toEqual([
      'parties.customer.manage',
      'sales.order.create', 'sales.order.manage', 'sales.dispatch.create', 'sales.dispatch.post',
      'sales.invoice.create', 'sales.return.create', 'sales.return.post',
      'finance.customer_receipt.create', 'finance.payment.manage', 'finance.account.manage',
      'finance.adjustment_note.edit', 'finance.adjustment_note.manage',
    ]);
    expect(SUPPLIER_LOOKUP_CAPABILITIES).toEqual([
      'parties.supplier.manage',
      'procurement.order.manage', 'procurement.receipt.post',
      'procurement.supplier_invoice.create', 'procurement.invoice.post',
      'procurement.purchase_return.create', 'procurement.return.post',
      'finance.supplier_advance.create', 'finance.supplier_payment.create',
      'finance.payment.manage', 'finance.account.manage',
      'finance.adjustment_note.edit', 'finance.adjustment_note.manage',
    ]);
  });
});
