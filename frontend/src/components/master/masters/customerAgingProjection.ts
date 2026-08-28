export type CustomerWithAging<T extends object = Record<string, unknown>> = T & {
  current_outstanding: number | null;
  outstanding_available: boolean;
};

const customerKey = (row: object): string => {
  const record = row as Record<string, unknown>;
  return String(record.customer_id ?? record.id ?? '');
};

/** Merge the authoritative receivable projection into customer master rows. */
export const mergeCustomersWithCanonicalAging = <T extends object>(
  customers: T[],
  agingRows: Record<string, unknown>[] | null,
): CustomerWithAging<T>[] => {
  if (agingRows === null) {
    return customers.map(customer => ({
      ...customer,
      current_outstanding: null,
      outstanding_available: false,
    }));
  }

  const outstandingByCustomer = new Map(
    agingRows
      .filter(row => row.total_outstanding !== undefined && row.total_outstanding !== null)
      .map(row => [customerKey(row), Number(row.total_outstanding)]),
  );
  return customers.map(customer => {
    const key = customerKey(customer);
    return {
      ...customer,
      current_outstanding: outstandingByCustomer.has(key)
        ? outstandingByCustomer.get(key)!
        : null,
      outstanding_available: outstandingByCustomer.has(key),
    };
  });
};
