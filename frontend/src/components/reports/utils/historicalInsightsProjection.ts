type JsonRecord = Record<string, unknown>;

const record = (value: unknown, label: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as JsonRecord;
};

const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
};

const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  return value;
};

const integer = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer.`);
  return Number(value);
};

const money = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)) {
    throw new Error(`${label} must be an exact two-decimal string.`);
  }
  return value;
};

const quantity = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value)) {
    throw new Error(`${label} must be an exact quantity string.`);
  }
  return value;
};

interface DocumentSummary { invoice_count: number; taxable: string; tax: string; total: string }
interface RankedRow { name: string; total: string }
export interface HistoricalProductInsight extends RankedRow { quantity: string }
export interface HistoricalCustomerInsight extends RankedRow { invoices: number }
export interface HistoricalMonth { month: string; invoices: number; total: string }

export interface HistoricalInsights {
  contract_version: '1.0.0';
  definition_version: 'historical-observed-v1';
  currency_code: 'INR';
  coverage: Record<string, number>;
  sales: DocumentSummary;
  purchases: DocumentSummary;
  returns: { sales_count: number; purchase_count: number; sales_total: string; purchase_total: string };
  outstanding: { receivable: string; payable: string; overdue_receivable: string; item_count: number };
  inventory: { batch_count: number; quantity: string; value: string; near_expiry_batches: number; near_expiry_value: string };
  monthly_sales: HistoricalMonth[];
  top_products: HistoricalProductInsight[];
  top_customers: HistoricalCustomerInsight[];
  limitations: string[];
}

const documentSummary = (value: unknown, label: string): DocumentSummary => {
  const row = record(value, label);
  return {
    invoice_count: integer(row.invoice_count, `${label} invoice count`),
    taxable: money(row.taxable, `${label} taxable`),
    tax: money(row.tax, `${label} tax`),
    total: money(row.total, `${label} total`),
  };
};

export const projectHistoricalInsights = (value: unknown): HistoricalInsights => {
  const root = record(value, 'Historical insights');
  if (root.contract_version !== '1.0.0' || root.definition_version !== 'historical-observed-v1' || root.currency_code !== 'INR') {
    throw new Error('Historical insights contract is unsupported.');
  }
  const coverageSource = record(root.coverage, 'Historical coverage');
  const coverage = Object.fromEntries(Object.entries(coverageSource).map(([kind, count]) => [kind, integer(count, `${kind} coverage`)]));
  const returns = record(root.returns, 'Historical returns');
  const outstanding = record(root.outstanding, 'Historical outstanding');
  const inventory = record(root.inventory, 'Historical inventory');
  return {
    contract_version: '1.0.0', definition_version: 'historical-observed-v1', currency_code: 'INR', coverage,
    sales: documentSummary(root.sales, 'Historical sales'),
    purchases: documentSummary(root.purchases, 'Historical purchases'),
    returns: {
      sales_count: integer(returns.sales_count, 'Sales return count'),
      purchase_count: integer(returns.purchase_count, 'Purchase return count'),
      sales_total: money(returns.sales_total, 'Sales return total'),
      purchase_total: money(returns.purchase_total, 'Purchase return total'),
    },
    outstanding: {
      receivable: money(outstanding.receivable, 'Historical receivable'),
      payable: money(outstanding.payable, 'Historical payable'),
      overdue_receivable: money(outstanding.overdue_receivable, 'Historical overdue receivable'),
      item_count: integer(outstanding.item_count, 'Historical outstanding item count'),
    },
    inventory: {
      batch_count: integer(inventory.batch_count, 'Historical batch count'),
      quantity: quantity(inventory.quantity, 'Historical inventory quantity'),
      value: money(inventory.value, 'Historical inventory value'),
      near_expiry_batches: integer(inventory.near_expiry_batches, 'Historical near-expiry batch count'),
      near_expiry_value: money(inventory.near_expiry_value, 'Historical near-expiry value'),
    },
    monthly_sales: array(root.monthly_sales, 'Historical monthly sales').map((item, index) => {
      const row = record(item, `Historical month ${index + 1}`);
      return { month: text(row.month, 'Historical month'), invoices: integer(row.invoices, 'Historical month invoices'), total: money(row.total, 'Historical month total') };
    }),
    top_products: array(root.top_products, 'Historical top products').map((item, index) => {
      const row = record(item, `Historical product ${index + 1}`);
      return { name: text(row.name, 'Historical product name'), quantity: quantity(row.quantity, 'Historical product quantity'), total: money(row.total, 'Historical product total') };
    }),
    top_customers: array(root.top_customers, 'Historical top customers').map((item, index) => {
      const row = record(item, `Historical customer ${index + 1}`);
      return { name: text(row.name, 'Historical customer name'), invoices: integer(row.invoices, 'Historical customer invoices'), total: money(row.total, 'Historical customer total') };
    }),
    limitations: array(root.limitations, 'Historical limitations').map((item, index) => text(item, `Historical limitation ${index + 1}`)),
  };
};
