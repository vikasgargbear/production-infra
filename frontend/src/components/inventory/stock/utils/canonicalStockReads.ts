import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import { safeCsvRows } from '../../../../utils/safeCsv';
import {
  addExactDecimals,
  compareExactDecimals,
  exactDecimalUnits,
  formatExactCurrency,
  formatExactDecimal,
  normalizeAuthoritativeDecimal,
  type ExactDecimalString,
} from '../../../../utils/exactDecimal';
import type {
  CanonicalPage,
  InventoryBranch,
  InventoryContext,
  InventoryLocation,
  InventoryReadParams,
  InventoryScope,
} from '../../../../services/api/modules/inventory/canonicalInventoryReads.api';

const QUANTITY = { scale: 6, maximumWholeDigits: 14 } as const;
const SIGNED_QUANTITY = { ...QUANTITY, allowNegative: true } as const;
const RATE = { scale: 4, maximumWholeDigits: 16 } as const;
const MONEY = { scale: 2, maximumWholeDigits: 18 } as const;
const SIGNED_MONEY = { ...MONEY, allowNegative: true } as const;

const record = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const array = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
};

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} is missing.`);
  return value;
};

const nullableString = (value: unknown, label: string): string | null => {
  if (value === null) return null;
  return requiredString(value, label);
};

const uuid = (value: unknown, label: string): string => {
  if (!isCanonicalUuid(value)) throw new Error(`${label} must be a canonical UUID.`);
  return String(value);
};

const count = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return Number(value);
};

const boolean = (value: unknown, label: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean.`);
  return value;
};

const exact = (
  value: unknown,
  label: string,
  options: { scale: number; maximumWholeDigits: number; allowNegative?: boolean },
): ExactDecimalString => {
  if (typeof value !== 'string') throw new Error(`${label} must cross JSON as a string.`);
  const sign = options.allowNegative ? '-?' : '';
  if (!new RegExp(`^${sign}(?:0|[1-9]\\d*)\\.\\d{${options.scale}}$`).test(value)) {
    throw new Error(`${label} must have fixed canonical scale ${options.scale}.`);
  }
  return normalizeAuthoritativeDecimal(value, label, options);
};

const nullableExact = (
  value: unknown,
  label: string,
  options: { scale: number; maximumWholeDigits: number },
): ExactDecimalString | null => value === null ? null : exact(value, label, options);

const dateOnly = (value: unknown, label: string): string => {
  const text = requiredString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${label} must be an ISO date.`);
  return text;
};

const nullableDate = (value: unknown, label: string): string | null => (
  value === null ? null : dateOnly(value, label)
);

const timestamp = (value: unknown, label: string): string => {
  const text = requiredString(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label} must be an ISO timestamp.`);
  return text;
};

const timeZone = (value: unknown, label: string): string => {
  const text = requiredString(value, label);
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: text }).format();
  } catch {
    throw new Error(`${label} must be an IANA time zone.`);
  }
  return text;
};

const decodeLocation = (value: unknown, label: string): InventoryLocation => {
  const row = record(value, label);
  return {
    location_id: uuid(row.location_id, `${label} location_id`),
    location_code: requiredString(row.location_code, `${label} location_code`),
    location_name: requiredString(row.location_name, `${label} location_name`),
  };
};

const decodeBranch = (value: unknown, label: string): InventoryBranch => {
  const row = record(value, label);
  return {
    branch_id: uuid(row.branch_id, `${label} branch_id`),
    branch_code: requiredString(row.branch_code, `${label} branch_code`),
    branch_name: requiredString(row.branch_name, `${label} branch_name`),
    locations: array(row.locations, `${label} locations`).map((item, index) => (
      decodeLocation(item, `${label} location ${index + 1}`)
    )),
  };
};

export const decodeInventoryContext = (value: unknown): InventoryContext => {
  const row = record(value, 'Inventory context');
  return {
    organization_id: uuid(row.organization_id, 'Inventory context organization_id'),
    organization_timezone: timeZone(row.organization_timezone, 'Inventory context timezone'),
    business_date: dateOnly(row.business_date, 'Inventory context business_date'),
    branches: array(row.branches, 'Inventory context branches').map((item, index) => (
      decodeBranch(item, `Inventory branch ${index + 1}`)
    )),
  };
};

const decodeScope = (value: unknown): InventoryScope => {
  const row = record(value, 'Inventory scope');
  return {
    branch_id: uuid(row.branch_id, 'Inventory scope branch_id'),
    branch_code: requiredString(row.branch_code, 'Inventory scope branch_code'),
    branch_name: requiredString(row.branch_name, 'Inventory scope branch_name'),
    location_id: row.location_id === null ? null : uuid(row.location_id, 'Inventory scope location_id'),
    location_code: nullableString(row.location_code, 'Inventory scope location_code'),
    location_name: nullableString(row.location_name, 'Inventory scope location_name'),
  };
};

export type CurrentStockItem = {
  product_id: string;
  product_code: string;
  product_name: string;
  generic_name: string | null;
  hsn_code: string | null;
  product_type: string;
  unit: string;
  category: string | null;
  total_quantity: ExactDecimalString;
  total_value: ExactDecimalString;
  average_unit_cost: ExactDecimalString | null;
  batch_count: number;
  positive_stock_batch_count: number;
  exhausted_batch_count: number;
  negative_stock_batch_count: number;
  expired_batch_count: number;
  near_expiry_batch_count: number;
  requires_cold_chain: boolean;
};

export type CurrentStockSummary = {
  product_count: number;
  total_quantity: ExactDecimalString;
  total_value: ExactDecimalString;
  batch_count: number;
  positive_stock_batch_count: number;
  exhausted_batch_count: number;
  negative_stock_batch_count: number;
};

export type BatchItem = {
  batch_id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  batch_number: string;
  manufactured_on: string | null;
  expires_on: string | null;
  expiry_state: 'undated' | 'expired' | 'expiring_30d' | 'near_expiry_90d' | 'current';
  mrp: ExactDecimalString;
  status: string;
  is_saleable: boolean;
  total_quantity: ExactDecimalString;
  total_value: ExactDecimalString;
  average_unit_cost: ExactDecimalString | null;
};

export type BatchSummary = {
  batch_count: number;
  positive_stock_count: number;
  exhausted_batch_count: number;
  negative_stock_count: number;
  total_quantity: ExactDecimalString;
  total_value: ExactDecimalString;
  expired_count: number;
  expiring_30d_count: number;
  near_expiry_90d_count: number;
};

export type EntryKind = 'receipt' | 'issue' | 'transfer_in' | 'transfer_out'
  | 'count_gain' | 'count_loss' | 'value_adjustment' | 'reversal';

export type MovementItem = {
  movement_id: string;
  posted_at: string;
  entry_kind: EntryKind;
  quantity_delta: ExactDecimalString;
  value_delta: ExactDecimalString;
  absolute_quantity: ExactDecimalString;
  absolute_value: ExactDecimalString;
  unit_cost: ExactDecimalString;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  location_id: string;
  location_code: string;
  location_name: string;
  product_id: string;
  product_code: string;
  product_name: string;
  batch_id: string;
  batch_number: string;
  inventory_document_id: string;
  document_number: string;
  reverses_entry_id: string | null;
  reversed_entry_kind: EntryKind | null;
  reversal_reconciled: true;
  posted_by: string | null;
};

export type MovementSummary = {
  movement_count: number;
  gross_quantity: ExactDecimalString;
  net_quantity_delta: ExactDecimalString;
  gross_value: ExactDecimalString;
  net_value_delta: ExactDecimalString;
};

const page = <T, S>(
  value: unknown,
  decodeItem: (value: unknown, label: string) => T,
  decodeSummary: (value: unknown) => S,
  label: string,
): CanonicalPage<T, S> => {
  const row = record(value, label);
  const items = array(row.items, `${label} items`).map((item, index) => (
    decodeItem(item, `${label} item ${index + 1}`)
  ));
  const total = count(row.total_count, `${label} total_count`);
  if (items.length > total) throw new Error(`${label} page exceeds total_count.`);
  return {
    scope: decodeScope(row.scope),
    as_of: timestamp(row.as_of, `${label} as_of`),
    business_date: dateOnly(row.business_date, `${label} business_date`),
    items,
    total_count: total,
    summary: decodeSummary(row.summary),
    next_cursor: row.next_cursor === null ? null : requiredString(row.next_cursor, `${label} next_cursor`),
  };
};

const currentItem = (value: unknown, label: string): CurrentStockItem => {
  const row = record(value, label);
  const result = {
    product_id: uuid(row.product_id, `${label} product_id`),
    product_code: requiredString(row.product_code, `${label} product_code`),
    product_name: requiredString(row.product_name, `${label} product_name`),
    generic_name: nullableString(row.generic_name, `${label} generic_name`),
    hsn_code: nullableString(row.hsn_code, `${label} hsn_code`),
    product_type: requiredString(row.product_type, `${label} product_type`),
    unit: requiredString(row.unit, `${label} unit`),
    category: nullableString(row.category, `${label} category`),
    total_quantity: exact(row.total_quantity, `${label} total_quantity`, QUANTITY),
    total_value: exact(row.total_value, `${label} total_value`, MONEY),
    average_unit_cost: nullableExact(row.average_unit_cost, `${label} average_unit_cost`, RATE),
    batch_count: count(row.batch_count, `${label} batch_count`),
    positive_stock_batch_count: count(row.positive_stock_batch_count, `${label} positive_stock_batch_count`),
    exhausted_batch_count: count(row.exhausted_batch_count, `${label} exhausted_batch_count`),
    negative_stock_batch_count: count(row.negative_stock_batch_count, `${label} negative_stock_batch_count`),
    expired_batch_count: count(row.expired_batch_count, `${label} expired_batch_count`),
    near_expiry_batch_count: count(row.near_expiry_batch_count, `${label} near_expiry_batch_count`),
    requires_cold_chain: boolean(row.requires_cold_chain, `${label} requires_cold_chain`),
  };
  if (result.batch_count !== result.positive_stock_batch_count
    + result.exhausted_batch_count + result.negative_stock_batch_count) {
    throw new Error(`${label} batch counts do not reconcile by stock sign.`);
  }
  return result;
};

const currentSummary = (value: unknown): CurrentStockSummary => {
  const row = record(value, 'Current stock summary');
  const result = {
    product_count: count(row.product_count, 'Current stock summary product_count'),
    total_quantity: exact(row.total_quantity, 'Current stock summary total_quantity', QUANTITY),
    total_value: exact(row.total_value, 'Current stock summary total_value', MONEY),
    batch_count: count(row.batch_count, 'Current stock summary batch_count'),
    positive_stock_batch_count: count(
      row.positive_stock_batch_count, 'Current stock summary positive_stock_batch_count',
    ),
    exhausted_batch_count: count(row.exhausted_batch_count, 'Current stock summary exhausted_batch_count'),
    negative_stock_batch_count: count(
      row.negative_stock_batch_count, 'Current stock summary negative_stock_batch_count',
    ),
  };
  if (result.batch_count !== result.positive_stock_batch_count
    + result.exhausted_batch_count + result.negative_stock_batch_count) {
    throw new Error('Current stock summary batch counts do not reconcile by stock sign.');
  }
  return result;
};

const batchItem = (value: unknown, label: string): BatchItem => {
  const row = record(value, label);
  const expiryState = requiredString(row.expiry_state, `${label} expiry_state`) as BatchItem['expiry_state'];
  if (!['undated', 'expired', 'expiring_30d', 'near_expiry_90d', 'current'].includes(expiryState)) {
    throw new Error(`${label} expiry_state is invalid.`);
  }
  return {
    batch_id: uuid(row.batch_id, `${label} batch_id`),
    product_id: uuid(row.product_id, `${label} product_id`),
    product_code: requiredString(row.product_code, `${label} product_code`),
    product_name: requiredString(row.product_name, `${label} product_name`),
    batch_number: requiredString(row.batch_number, `${label} batch_number`),
    manufactured_on: nullableDate(row.manufactured_on, `${label} manufactured_on`),
    expires_on: nullableDate(row.expires_on, `${label} expires_on`),
    expiry_state: expiryState,
    mrp: exact(row.mrp, `${label} mrp`, RATE),
    status: requiredString(row.status, `${label} status`),
    is_saleable: boolean(row.is_saleable, `${label} is_saleable`),
    total_quantity: exact(row.total_quantity, `${label} total_quantity`, QUANTITY),
    total_value: exact(row.total_value, `${label} total_value`, MONEY),
    average_unit_cost: nullableExact(row.average_unit_cost, `${label} average_unit_cost`, RATE),
  };
};

const batchSummary = (value: unknown): BatchSummary => {
  const row = record(value, 'Batch summary');
  const result = {
    batch_count: count(row.batch_count, 'Batch summary batch_count'),
    positive_stock_count: count(row.positive_stock_count, 'Batch summary positive_stock_count'),
    exhausted_batch_count: count(row.exhausted_batch_count, 'Batch summary exhausted_batch_count'),
    negative_stock_count: count(row.negative_stock_count, 'Batch summary negative_stock_count'),
    total_quantity: exact(row.total_quantity, 'Batch summary total_quantity', QUANTITY),
    total_value: exact(row.total_value, 'Batch summary total_value', MONEY),
    expired_count: count(row.expired_count, 'Batch summary expired_count'),
    expiring_30d_count: count(row.expiring_30d_count, 'Batch summary expiring_30d_count'),
    near_expiry_90d_count: count(row.near_expiry_90d_count, 'Batch summary near_expiry_90d_count'),
  };
  if (result.batch_count !== result.positive_stock_count
    + result.exhausted_batch_count + result.negative_stock_count) {
    throw new Error('Batch summary counts do not reconcile by stock sign.');
  }
  return result;
};

const ENTRY_KINDS: EntryKind[] = [
  'receipt', 'issue', 'transfer_in', 'transfer_out', 'count_gain',
  'count_loss', 'value_adjustment', 'reversal',
];

const entryKind = (value: unknown, label: string): EntryKind => {
  const result = requiredString(value, label) as EntryKind;
  if (!ENTRY_KINDS.includes(result)) throw new Error(`${label} is invalid.`);
  return result;
};

const movementItem = (value: unknown, label: string): MovementItem => {
  const row = record(value, label);
  const result: MovementItem = {
    movement_id: uuid(row.movement_id, `${label} movement_id`),
    posted_at: timestamp(row.posted_at, `${label} posted_at`),
    entry_kind: entryKind(row.entry_kind, `${label} entry_kind`),
    quantity_delta: exact(row.quantity_delta, `${label} quantity_delta`, SIGNED_QUANTITY),
    value_delta: exact(row.value_delta, `${label} value_delta`, SIGNED_MONEY),
    absolute_quantity: exact(row.absolute_quantity, `${label} absolute_quantity`, QUANTITY),
    absolute_value: exact(row.absolute_value, `${label} absolute_value`, MONEY),
    unit_cost: exact(row.unit_cost, `${label} unit_cost`, RATE),
    branch_id: uuid(row.branch_id, `${label} branch_id`),
    branch_code: requiredString(row.branch_code, `${label} branch_code`),
    branch_name: requiredString(row.branch_name, `${label} branch_name`),
    location_id: uuid(row.location_id, `${label} location_id`),
    location_code: requiredString(row.location_code, `${label} location_code`),
    location_name: requiredString(row.location_name, `${label} location_name`),
    product_id: uuid(row.product_id, `${label} product_id`),
    product_code: requiredString(row.product_code, `${label} product_code`),
    product_name: requiredString(row.product_name, `${label} product_name`),
    batch_id: uuid(row.batch_id, `${label} batch_id`),
    batch_number: requiredString(row.batch_number, `${label} batch_number`),
    inventory_document_id: uuid(row.inventory_document_id, `${label} inventory_document_id`),
    document_number: requiredString(row.document_number, `${label} document_number`),
    reverses_entry_id: row.reverses_entry_id === null
      ? null : uuid(row.reverses_entry_id, `${label} reverses_entry_id`),
    reversed_entry_kind: row.reversed_entry_kind === null
      ? null : entryKind(row.reversed_entry_kind, `${label} reversed_entry_kind`),
    reversal_reconciled: boolean(row.reversal_reconciled, `${label} reversal_reconciled`) as true,
    posted_by: nullableString(row.posted_by, `${label} posted_by`),
  };
  if (result.reversal_reconciled !== true) {
    throw new Error(`${label} reversal reconciliation was not proven by the server.`);
  }
  const quantity = exactDecimalUnits(result.quantity_delta, `${label} quantity_delta`, SIGNED_QUANTITY);
  const valueDelta = exactDecimalUnits(result.value_delta, `${label} value_delta`, SIGNED_MONEY);
  const absoluteQuantity = exactDecimalUnits(result.absolute_quantity, `${label} absolute_quantity`, QUANTITY);
  const absoluteValue = exactDecimalUnits(result.absolute_value, `${label} absolute_value`, MONEY);
  if ((quantity < 0n ? -quantity : quantity) !== absoluteQuantity
    || (valueDelta < 0n ? -valueDelta : valueDelta) !== absoluteValue) {
    throw new Error(`${label} absolute deltas do not match signed ledger authority.`);
  }
  if (result.entry_kind === 'value_adjustment' && (quantity !== 0n || valueDelta === 0n)) {
    throw new Error(`${label} value adjustment must have zero quantity and nonzero value.`);
  }
  if (result.entry_kind === 'reversal') {
    if (result.reverses_entry_id === null || result.reversed_entry_kind === null
      || (quantity === 0n && valueDelta === 0n)) {
      throw new Error(`${label} reversal lineage or inverse delta is incomplete.`);
    }
  } else if (result.reverses_entry_id !== null || result.reversed_entry_kind !== null) {
    throw new Error(`${label} non-reversal cannot claim reversal lineage.`);
  }
  const positive = ['receipt', 'transfer_in', 'count_gain'].includes(result.entry_kind);
  const negative = ['issue', 'transfer_out', 'count_loss'].includes(result.entry_kind);
  if ((positive && (quantity <= 0n || valueDelta < 0n))
    || (negative && (quantity >= 0n || valueDelta > 0n))) {
    throw new Error(`${label} ledger signs contradict entry_kind.`);
  }
  return result;
};

const movementSummary = (value: unknown): MovementSummary => {
  const row = record(value, 'Movement summary');
  return {
    movement_count: count(row.movement_count, 'Movement summary movement_count'),
    gross_quantity: exact(row.gross_quantity, 'Movement summary gross_quantity', QUANTITY),
    net_quantity_delta: exact(row.net_quantity_delta, 'Movement summary net_quantity_delta', SIGNED_QUANTITY),
    gross_value: exact(row.gross_value, 'Movement summary gross_value', MONEY),
    net_value_delta: exact(row.net_value_delta, 'Movement summary net_value_delta', SIGNED_MONEY),
  };
};

export const decodeCurrentStockPage = (value: unknown) => (
  page(value, currentItem, currentSummary, 'Current stock page')
);
export const decodeBatchPage = (value: unknown) => (
  page(value, batchItem, batchSummary, 'Batch page')
);
export const decodeMovementPage = (value: unknown) => (
  page(value, movementItem, movementSummary, 'Movement page')
);

export async function exhaustCursorPages<T, S>(
  load: (params: InventoryReadParams) => Promise<{ data: unknown }>,
  params: InventoryReadParams,
  decode: (value: unknown) => CanonicalPage<T, S>,
): Promise<CanonicalPage<T, S>> {
  let cursor: string | undefined;
  let first: CanonicalPage<T, S> | null = null;
  const items: T[] = [];
  const seenCursors = new Set<string>();
  let terminated = false;
  for (let pageNumber = 0; pageNumber < 10_000; pageNumber += 1) {
    const decoded = decode((await load({ ...params, limit: 200, cursor })).data);
    first ||= decoded;
    if (decoded.scope.branch_id !== first.scope.branch_id
      || decoded.scope.location_id !== first.scope.location_id
      || decoded.as_of !== first.as_of
      || decoded.business_date !== first.business_date
      || decoded.total_count !== first.total_count
      || JSON.stringify(decoded.summary) !== JSON.stringify(first.summary)) {
      throw new Error('Inventory pagination scope or summary changed while reading.');
    }
    items.push(...decoded.items);
    if (decoded.next_cursor === null) {
      terminated = true;
      break;
    }
    if (seenCursors.has(decoded.next_cursor)) throw new Error('Inventory pagination cursor repeated.');
    seenCursors.add(decoded.next_cursor);
    cursor = decoded.next_cursor;
  }
  if (!first) throw new Error('Inventory pagination returned no page.');
  if (!terminated) throw new Error('Inventory pagination cursor did not terminate.');
  if (items.length !== first.total_count) {
    throw new Error(`Inventory pagination was incomplete: loaded ${items.length} of ${first.total_count}.`);
  }
  return { ...first, items, next_cursor: null };
}

export const compareQuantity = (left: unknown, right: unknown) => (
  compareExactDecimals(left, right, 'Stock quantity', SIGNED_QUANTITY)
);
export const compareMoney = (left: unknown, right: unknown) => (
  compareExactDecimals(left, right, 'Stock money', SIGNED_MONEY)
);
export const isZeroQuantity = (value: unknown) => (
  exactDecimalUnits(value, 'Stock quantity', SIGNED_QUANTITY) === 0n
);
export const displayQuantity = (value: unknown) => (
  formatExactDecimal(value, 'Stock quantity', SIGNED_QUANTITY, 0)
);
export const displayMoney = (value: unknown) => formatExactCurrency(value, 'Stock value');
export const displayRate = (value: unknown) => (
  `₹${formatExactDecimal(value, 'Stock unit cost', RATE, 2)}`
);
export const addMoney = (values: unknown[]) => addExactDecimals(values, 'Stock value', SIGNED_MONEY);
export const displayDate = (value: string | null) => value
  ? `${value.slice(8, 10)}/${value.slice(5, 7)}/${value.slice(0, 4)}` : '—';

export const displayOrganizationTimestamp = (value: string, organizationTimeZone: string) => (
  new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium', timeStyle: 'medium', timeZone: organizationTimeZone,
  }).format(new Date(timestamp(value, 'Inventory timestamp')))
);

export const movementLabel = (movement: MovementItem): string => {
  if (movement.entry_kind === 'reversal') {
    return `Reversal of ${(movement.reversed_entry_kind || 'entry').replace(/_/g, ' ')}`;
  }
  return movement.entry_kind.replace(/_/g, ' ');
};

export const batchItemsCsv = (items: readonly BatchItem[]): string => `${safeCsvRows([
  ['Batch', 'Product', 'Quantity', 'Value', 'Expiry', 'Status'],
  ...items.map(item => [
    item.batch_number, item.product_name, item.total_quantity, item.total_value,
    item.expires_on || '', item.status,
  ]),
])}\n`;

export const movementItemsCsv = (items: readonly MovementItem[]): string => `${safeCsvRows([
  ['Posted At', 'Document', 'Entry Kind', 'Product', 'Batch', 'Location',
    'Quantity Delta', 'Value Delta', 'Unit Cost'],
  ...items.map(item => [
    item.posted_at, item.document_number, item.entry_kind, item.product_name,
    item.batch_number, item.location_name, item.quantity_delta, item.value_delta,
    item.unit_cost,
  ]),
])}\n`;
