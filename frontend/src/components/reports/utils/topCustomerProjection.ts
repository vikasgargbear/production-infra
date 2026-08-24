export type TopCustomerProjection = Record<string, unknown> & {
  name: string;
  revenue: number | null;
  orders: number | null;
};

const finiteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/** Normalize the canonical dashboard response once at the API boundary. */
export const projectTopCustomer = (row: Record<string, unknown>): TopCustomerProjection => ({
  ...row,
  name: String(row.name ?? row.customer_name ?? 'Unknown customer'),
  revenue: finiteNumber(row.revenue ?? row.total_revenue ?? row.total_purchase),
  orders: finiteNumber(row.orders ?? row.order_count),
});
