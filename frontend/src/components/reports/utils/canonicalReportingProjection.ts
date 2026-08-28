import {
  addExactDecimals,
  compareExactDecimals,
  normalizeAuthoritativeDecimal,
  subtractExactDecimals,
} from '../../../utils/exactDecimal';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import { requireCalendarDate } from '../../../utils/calendarDate';

const MONEY = { scale: 2, maximumWholeDigits: 20, allowNegative: true } as const;
type JsonObject = Record<string, unknown>;

const object = (value: unknown, label: string): JsonObject => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  return value as JsonObject;
};
const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} is invalid.`);
  return value;
};
const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is invalid.`);
  return value;
};
const uuid = (value: unknown, label: string): string => {
  const result = text(value, label);
  if (!isCanonicalUuid(result)) throw new Error(`${label} is not a canonical UUID.`);
  return result;
};
const money = (value: unknown, label: string): string => (
  normalizeAuthoritativeDecimal(value, label, MONEY)
);
const count = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${label} is invalid.`);
  return value as number;
};
const version = (source: JsonObject): void => {
  if (source.contract_version !== '1.0.0' || source.definition_version !== 'canonical-factual-v1') {
    throw new Error('Canonical report contract version is unsupported.');
  }
  if (source.currency_code !== 'INR') throw new Error('Canonical report currency is unsupported.');
};

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense';
export interface TrialBalanceRow {
  account_id: string; account_code: string; account_name: string; account_type: AccountType;
  opening_balance: string; period_debit: string; period_credit: string; closing_balance: string;
}
export interface TrialBalanceProjection {
  date_from: string; date_to: string; rows: TrialBalanceRow[];
  total_period_debit: string; total_period_credit: string; period_balanced: boolean;
}
export interface ProfitLossRow {
  account_id: string; account_code: string; account_name: string;
  account_type: 'income' | 'expense'; amount: string;
}
export interface ProfitLossProjection {
  date_from: string; date_to: string; income: string; expenses: string; result: string;
  rows: ProfitLossRow[];
}
export interface CustomerActivityRow {
  customer_account_id: string; party_id: string; customer_code: string; customer_name: string;
  account_status: 'active' | 'on_hold' | 'closed'; invoice_count: number; billed_sales: string;
  first_invoice_date: string; last_invoice_date: string;
}
export interface CustomerActivityProjection {
  date_from: string; date_to: string; transacting_customer_count: number;
  invoice_count: number; billed_sales: string; customers: CustomerActivityRow[];
}

const accountType = (value: unknown): AccountType => {
  if (value === 'asset' || value === 'liability' || value === 'equity'
    || value === 'income' || value === 'expense') return value;
  throw new Error('Canonical account type is invalid.');
};

export function projectTrialBalance(payload: unknown): TrialBalanceProjection {
  const source = object(payload, 'Trial balance');
  version(source);
  const rows = array(source.rows, 'Trial-balance rows').map((raw, index): TrialBalanceRow => {
    const row = object(raw, `Trial-balance row ${index + 1}`);
    const projected = {
      account_id: uuid(row.account_id, `Trial-balance row ${index + 1} account`),
      account_code: text(row.account_code, `Trial-balance row ${index + 1} code`),
      account_name: text(row.account_name, `Trial-balance row ${index + 1} name`),
      account_type: accountType(row.account_type),
      opening_balance: money(row.opening_balance, `Trial-balance row ${index + 1} opening`),
      period_debit: money(row.period_debit, `Trial-balance row ${index + 1} debit`),
      period_credit: money(row.period_credit, `Trial-balance row ${index + 1} credit`),
      closing_balance: money(row.closing_balance, `Trial-balance row ${index + 1} closing`),
    };
    const calculated = subtractExactDecimals(
      addExactDecimals([projected.opening_balance, projected.period_debit], 'Trial-balance row movement', MONEY),
      projected.period_credit, 'Trial-balance row closing', MONEY,
    );
    if (compareExactDecimals(calculated, projected.closing_balance, 'Trial-balance row closing', MONEY) !== 0) {
      throw new Error('Trial-balance row does not reconcile.');
    }
    return projected;
  });
  const totalDebit = money(source.total_period_debit, 'Trial-balance total debit');
  const totalCredit = money(source.total_period_credit, 'Trial-balance total credit');
  if (compareExactDecimals(totalDebit, addExactDecimals(rows.map(row => row.period_debit), 'Trial-balance debit rows', MONEY), 'Trial-balance debit total', MONEY) !== 0
    || compareExactDecimals(totalCredit, addExactDecimals(rows.map(row => row.period_credit), 'Trial-balance credit rows', MONEY), 'Trial-balance credit total', MONEY) !== 0) {
    throw new Error('Trial-balance totals do not reconcile.');
  }
  const balanced = compareExactDecimals(totalDebit, totalCredit, 'Trial-balance equality', MONEY) === 0;
  if (source.period_balanced !== balanced) throw new Error('Trial-balance status does not reconcile.');
  return {
    date_from: requireCalendarDate(source.date_from, 'Trial-balance start'),
    date_to: requireCalendarDate(source.date_to, 'Trial-balance end'),
    rows, total_period_debit: totalDebit, total_period_credit: totalCredit,
    period_balanced: balanced,
  };
}

export function projectProfitLoss(payload: unknown): ProfitLossProjection {
  const source = object(payload, 'Profit and loss');
  version(source);
  const rows = array(source.rows, 'Profit-and-loss rows').map((raw, index): ProfitLossRow => {
    const row = object(raw, `Profit-and-loss row ${index + 1}`);
    if (row.account_type !== 'income' && row.account_type !== 'expense') {
      throw new Error('Profit-and-loss account type is invalid.');
    }
    return {
      account_id: uuid(row.account_id, `Profit-and-loss row ${index + 1} account`),
      account_code: text(row.account_code, `Profit-and-loss row ${index + 1} code`),
      account_name: text(row.account_name, `Profit-and-loss row ${index + 1} name`),
      account_type: row.account_type,
      amount: money(row.amount, `Profit-and-loss row ${index + 1} amount`),
    };
  });
  const income = money(source.income, 'Profit-and-loss income');
  const expenses = money(source.expenses, 'Profit-and-loss expenses');
  const result = money(source.result, 'Profit-and-loss result');
  if (compareExactDecimals(income, addExactDecimals(rows.filter(row => row.account_type === 'income').map(row => row.amount), 'Income rows', MONEY), 'Income total', MONEY) !== 0
    || compareExactDecimals(expenses, addExactDecimals(rows.filter(row => row.account_type === 'expense').map(row => row.amount), 'Expense rows', MONEY), 'Expense total', MONEY) !== 0
    || compareExactDecimals(result, subtractExactDecimals(income, expenses, 'Profit-and-loss result', MONEY), 'Profit-and-loss result', MONEY) !== 0) {
    throw new Error('Profit-and-loss totals do not reconcile.');
  }
  return {
    date_from: requireCalendarDate(source.date_from, 'Profit-and-loss start'),
    date_to: requireCalendarDate(source.date_to, 'Profit-and-loss end'),
    income, expenses, result, rows,
  };
}

export function projectCustomerActivity(payload: unknown): CustomerActivityProjection {
  const source = object(payload, 'Customer activity');
  version(source);
  const customers = array(source.customers, 'Customer activity rows').map((raw, index): CustomerActivityRow => {
    const row = object(raw, `Customer activity row ${index + 1}`);
    if (row.account_status !== 'active' && row.account_status !== 'on_hold' && row.account_status !== 'closed') {
      throw new Error('Customer account status is invalid.');
    }
    return {
      customer_account_id: uuid(row.customer_account_id, `Customer activity row ${index + 1} account`),
      party_id: uuid(row.party_id, `Customer activity row ${index + 1} party`),
      customer_code: text(row.customer_code, `Customer activity row ${index + 1} code`),
      customer_name: text(row.customer_name, `Customer activity row ${index + 1} name`),
      account_status: row.account_status,
      invoice_count: count(row.invoice_count, `Customer activity row ${index + 1} invoices`),
      billed_sales: money(row.billed_sales, `Customer activity row ${index + 1} billed sales`),
      first_invoice_date: requireCalendarDate(row.first_invoice_date, 'First invoice date'),
      last_invoice_date: requireCalendarDate(row.last_invoice_date, 'Last invoice date'),
    };
  });
  const customerCount = count(source.transacting_customer_count, 'Transacting customer count');
  const invoiceCount = count(source.invoice_count, 'Customer activity invoice count');
  const billedSales = money(source.billed_sales, 'Customer activity billed sales');
  if (customerCount !== customers.length
    || invoiceCount !== customers.reduce((sum, row) => sum + row.invoice_count, 0)
    || compareExactDecimals(billedSales, addExactDecimals(customers.map(row => row.billed_sales), 'Customer billed rows', MONEY), 'Customer billed total', MONEY) !== 0) {
    throw new Error('Customer activity totals do not reconcile.');
  }
  return {
    date_from: requireCalendarDate(source.date_from, 'Customer activity start'),
    date_to: requireCalendarDate(source.date_to, 'Customer activity end'),
    transacting_customer_count: customerCount, invoice_count: invoiceCount,
    billed_sales: billedSales, customers,
  };
}
