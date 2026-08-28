export type ExactDecimal = string | number;

export interface CanonicalBusinessContext {
  organization_id: string;
  organization_timezone: string;
  business_date: string;
}

export interface ExecutiveStats {
  total_revenue: ExactDecimal;
  total_orders: number;
  new_customers: number;
  revenue_change: number | null;
  orders_change: number | null;
  new_customers_change: number | null;
}

export interface ExecutiveInventorySummary {
  organization_timezone: string;
  business_date: string;
  as_of: string;
  active_products: number;
  stock_value: ExactDecimal;
  out_of_stock_products: number;
}

export interface ExecutiveSalesPoint {
  date: string;
  revenue: number;
  invoice_count: number;
}

export interface ExecutiveRankedRow {
  id: string;
  name: string;
  revenue: ExactDecimal;
  volume: number;
}

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as Record<string, unknown>;
};

const exactDecimal = (value: unknown, label: string): ExactDecimal => {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') {
    throw new Error(`${label} is unavailable`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} is invalid`);
  return value;
};

const finiteNumber = (value: unknown, label: string): number => {
  const parsed = Number(exactDecimal(value, label));
  return parsed;
};

const count = (value: unknown, label: string): number => {
  const parsed = finiteNumber(value, label);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} is not a count`);
  return parsed;
};

const nullableNumber = (value: unknown, label: string): number | null => {
  if (value === null) return null;
  return finiteNumber(value, label);
};

const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is unavailable`);
  return value;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = (value: unknown, label: string): string => {
  const result = text(value, label);
  if (!ISO_DATE.test(result)) throw new Error(`${label} is not an ISO date`);
  return result;
};

export const projectBusinessContext = (value: unknown): CanonicalBusinessContext => {
  const row = record(value, 'Business context');
  return {
    organization_id: text(row.organization_id, 'Organization ID'),
    organization_timezone: text(row.organization_timezone, 'Organization timezone'),
    business_date: isoDate(row.business_date, 'Business date'),
  };
};

export const projectExecutiveStats = (value: unknown): ExecutiveStats => {
  const row = record(value, 'Dashboard statistics');
  return {
    total_revenue: exactDecimal(row.total_revenue, 'Total revenue'),
    total_orders: count(row.total_orders, 'Total orders'),
    new_customers: count(row.new_customers, 'New customers'),
    revenue_change: nullableNumber(row.revenue_change, 'Revenue change'),
    orders_change: nullableNumber(row.orders_change, 'Orders change'),
    new_customers_change: nullableNumber(row.new_customers_change, 'New customers change'),
  };
};

export const projectExecutiveInventory = (value: unknown): ExecutiveInventorySummary => {
  const row = record(value, 'Inventory summary');
  return {
    organization_timezone: text(row.organization_timezone, 'Inventory timezone'),
    business_date: isoDate(row.business_date, 'Inventory business date'),
    as_of: text(row.as_of, 'Inventory snapshot time'),
    active_products: count(row.active_products, 'Active products'),
    stock_value: exactDecimal(row.stock_value, 'Stock value'),
    out_of_stock_products: count(row.out_of_stock_products, 'Out-of-stock products'),
  };
};

export const projectExecutiveSales = (value: unknown): ExecutiveSalesPoint[] => {
  if (!Array.isArray(value)) throw new Error('Sales trend is not a list');
  return value.map((item, index) => {
    const row = record(item, `Sales trend row ${index + 1}`);
    return {
      date: isoDate(row.date, `Sales trend row ${index + 1} date`),
      revenue: finiteNumber(row.revenue, `Sales trend row ${index + 1} revenue`),
      invoice_count: count(row.invoice_count, `Sales trend row ${index + 1} invoice count`),
    };
  });
};

export const projectTopProducts = (value: unknown): ExecutiveRankedRow[] => {
  if (!Array.isArray(value)) throw new Error('Top products is not a list');
  return value.map((item, index) => {
    const row = record(item, `Top product ${index + 1}`);
    return {
      id: text(row.id, `Top product ${index + 1} ID`),
      name: text(row.name, `Top product ${index + 1} name`),
      revenue: exactDecimal(row.revenue, `Top product ${index + 1} revenue`),
      volume: finiteNumber(row.sales, `Top product ${index + 1} sales`),
    };
  });
};

export const projectTopCustomers = (value: unknown): ExecutiveRankedRow[] => {
  if (!Array.isArray(value)) throw new Error('Top customers is not a list');
  return value.map((item, index) => {
    const row = record(item, `Top customer ${index + 1}`);
    return {
      id: text(row.id, `Top customer ${index + 1} ID`),
      name: text(row.name, `Top customer ${index + 1} name`),
      revenue: exactDecimal(row.revenue, `Top customer ${index + 1} revenue`),
      volume: count(row.orders, `Top customer ${index + 1} orders`),
    };
  });
};

const utcDate = (iso: string): Date => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

const formatUtcDate = (value: Date): string => [
  value.getUTCFullYear(),
  String(value.getUTCMonth() + 1).padStart(2, '0'),
  String(value.getUTCDate()).padStart(2, '0'),
].join('-');

export type ExecutiveRange = '7days' | '30days' | 'month' | '90days';

export const dashboardDateRange = (
  businessDate: string,
  range: ExecutiveRange,
): { date_from: string; date_to: string } => {
  if (!ISO_DATE.test(businessDate)) throw new Error('Business date is not an ISO date');
  if (range === 'month') return { date_from: `${businessDate.slice(0, 8)}01`, date_to: businessDate };
  const inclusiveDays = range === '7days' ? 7 : range === '30days' ? 30 : 90;
  const start = utcDate(businessDate);
  start.setUTCDate(start.getUTCDate() - (inclusiveDays - 1));
  return { date_from: formatUtcDate(start), date_to: businessDate };
};
