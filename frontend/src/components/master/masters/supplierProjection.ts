export interface SupplierOutstandingProjection {
  current_outstanding: null;
  outstanding: null;
  outstanding_available: false;
}

/**
 * The supplier directory does not own payable/open-item aggregation.
 * Discard compatibility zeroes so the master never presents missing finance
 * authority as a real zero balance.
 */
export const withoutUnownedSupplierOutstanding = <T extends Record<string, unknown>>(
  supplier: T,
): T & SupplierOutstandingProjection => ({
  ...supplier,
  current_outstanding: null,
  outstanding: null,
  outstanding_available: false,
});
