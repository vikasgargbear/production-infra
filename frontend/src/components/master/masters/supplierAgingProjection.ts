import { normalizeAuthoritativeDecimal } from '../../../utils/exactDecimal';

export type SupplierWithAging<T extends object = Record<string, unknown>> = T & {
  current_outstanding: string | null;
  outstanding_available: boolean;
};

const supplierKey = (row: object): string => {
  const record = row as Record<string, unknown>;
  return String(record.supplier_id ?? record.party_account_id ?? record.id ?? '');
};

/** Merge backend-owned payable facts into supplier master rows without numeric coercion. */
export const mergeSuppliersWithCanonicalAging = <T extends object>(
  suppliers: T[],
  agingRows: Record<string, unknown>[] | null,
): SupplierWithAging<T>[] => {
  if (agingRows === null) {
    return suppliers.map(supplier => ({
      ...supplier,
      current_outstanding: null,
      outstanding_available: false,
    }));
  }

  const outstandingBySupplier = new Map(
    agingRows
      .filter(row => row.total_outstanding !== undefined && row.total_outstanding !== null)
      .map(row => [
        supplierKey(row),
        normalizeAuthoritativeDecimal(row.total_outstanding, 'Supplier payable', {
          scale: 2, maximumWholeDigits: 20, allowNegative: false,
        }),
      ]),
  );

  return suppliers.map(supplier => {
    const key = supplierKey(supplier);
    return {
      ...supplier,
      current_outstanding: outstandingBySupplier.has(key)
        ? outstandingBySupplier.get(key)!
        : null,
      outstanding_available: outstandingBySupplier.has(key),
    };
  });
};
