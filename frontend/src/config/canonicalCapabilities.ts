export const FOUNDATION_CAPABILITIES = Object.freeze({
  product: 'catalog.product.manage',
  customer: 'parties.customer.manage',
  supplier: 'parties.supplier.manage',
});

export type FoundationCapability = typeof FOUNDATION_CAPABILITIES[keyof typeof FOUNDATION_CAPABILITIES];

const SALES_PRODUCT_LOOKUP = [
  'sales.order.create', 'sales.order.manage', 'sales.dispatch.create', 'sales.dispatch.post',
  'sales.invoice.create', 'sales.return.create', 'sales.return.post',
] as const;
const PROCUREMENT_PRODUCT_LOOKUP = [
  'procurement.order.manage', 'procurement.receipt.post',
  'procurement.supplier_invoice.create', 'procurement.invoice.post',
  'procurement.purchase_return.create', 'procurement.return.post',
] as const;
const FINANCE_PARTY_LOOKUP = [
  'finance.payment.manage', 'finance.account.manage',
  'finance.adjustment_note.edit', 'finance.adjustment_note.manage',
] as const;

/** Exact signed capabilities whose reviewed workflows require each lookup. */
export const PRODUCT_LOOKUP_CAPABILITIES = Object.freeze([
  FOUNDATION_CAPABILITIES.product,
  ...SALES_PRODUCT_LOOKUP,
  ...PROCUREMENT_PRODUCT_LOOKUP,
  'inventory.adjustment.create', 'inventory.transfer.create',
  'inventory.destruction.create', 'inventory.document.post', 'inventory.batch.manage',
  'inventory.reservation.manage',
] as const);

export const CUSTOMER_LOOKUP_CAPABILITIES = Object.freeze([
  FOUNDATION_CAPABILITIES.customer,
  ...SALES_PRODUCT_LOOKUP,
  'finance.customer_receipt.create',
  ...FINANCE_PARTY_LOOKUP,
] as const);

export const SUPPLIER_LOOKUP_CAPABILITIES = Object.freeze([
  FOUNDATION_CAPABILITIES.supplier,
  ...PROCUREMENT_PRODUCT_LOOKUP,
  'finance.supplier_advance.create', 'finance.supplier_payment.create',
  ...FINANCE_PARTY_LOOKUP,
] as const);
