import { apiHelpers } from '../../apiClient';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import {
  addExactDecimals,
  compareExactDecimals,
  exactDecimalUnits,
  normalizeAuthoritativeDecimal,
  type ExactDecimalOptions,
} from '../../../../utils/exactDecimal';

const quantityOptions = { scale: 6, maximumWholeDigits: 14, allowNegative: true } as const;
const positiveQuantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const costOptions = { scale: 4, maximumWholeDigits: 16 } as const;
const moneyOptions = { scale: 2, maximumWholeDigits: 18, allowNegative: true } as const;
const positiveMoneyOptions = { scale: 2, maximumWholeDigits: 18 } as const;

export interface EligibleTransferBatch {
  batch_id: string;
  batch_number: string;
  expires_on: string;
  product_id: string;
  uom_conversion_id: string;
  selected_uom_code: string;
  base_uom_code: string;
  uom_multiplier: string;
  available_base_quantity: string;
  available_selected_quantity: string;
  average_unit_cost: string;
  inventory_value: string;
  is_default: boolean;
}

export interface TransferReadbackLine {
  inventory_document_line_id: string;
  product_id: string;
  batch_id: string;
  from_location_id: string;
  to_location_id: string;
  base_quantity: string;
  unit_cost: string;
  extended_cost: string;
  transfer_out_ledger_id: string;
  transfer_out_branch_id: string;
  transfer_out_location_id: string;
  transfer_out_product_id: string;
  transfer_out_batch_id: string;
  transfer_out_quantity: string;
  transfer_out_unit_cost: string;
  transfer_out_value: string;
  transfer_in_ledger_id: string;
  transfer_in_branch_id: string;
  transfer_in_location_id: string;
  transfer_in_product_id: string;
  transfer_in_batch_id: string;
  transfer_in_quantity: string;
  transfer_in_unit_cost: string;
  transfer_in_value: string;
}

export interface TransferReadback {
  id: string;
  document_number: string;
  status: 'posted';
  branch_id: string;
  destination_branch_id: string;
  document_date: string;
  total_abs_base_quantity: string;
  total_value: string;
  row_version: number;
  lines: TransferReadbackLine[];
}

function requireUuid(value: unknown, label: string): string {
  if (!isCanonicalUuid(value)) throw new Error(`${label} must be a canonical UUID.`);
  return String(value);
}

function requirePositiveDecimal(
  value: unknown,
  label: string,
  options: ExactDecimalOptions,
): string {
  const normalized = normalizeAuthoritativeDecimal(value, label, options);
  if (exactDecimalUnits(normalized, label, options) <= 0n) {
    throw new Error(`${label} must be greater than zero.`);
  }
  return normalized;
}

export function decodeTransferReadback(value: unknown): TransferReadback {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Canonical transfer readback is missing.');
  }
  const document = value as Partial<TransferReadback>;
  if (document.status !== 'posted' || !Array.isArray(document.lines) || !document.lines.length
      || typeof document.document_number !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(String(document.document_date))
      || !Number.isSafeInteger(document.row_version) || Number(document.row_version) < 1) {
    throw new Error('Canonical transfer readback is incomplete or not posted.');
  }
  const decoded = {
    ...document,
    id: requireUuid(document.id, 'Transfer'),
    branch_id: requireUuid(document.branch_id, 'Source branch'),
    destination_branch_id: requireUuid(document.destination_branch_id, 'Destination branch'),
    total_abs_base_quantity: requirePositiveDecimal(document.total_abs_base_quantity, 'Transfer total quantity', positiveQuantityOptions),
    total_value: requirePositiveDecimal(document.total_value, 'Transfer total value', positiveMoneyOptions),
    lines: document.lines.map((line, index) => ({
      ...line,
      inventory_document_line_id: requireUuid(line.inventory_document_line_id, `Transfer line ${index + 1}`),
      product_id: requireUuid(line.product_id, `Transfer line ${index + 1} product`),
      batch_id: requireUuid(line.batch_id, `Transfer line ${index + 1} batch`),
      from_location_id: requireUuid(line.from_location_id, `Transfer line ${index + 1} source location`),
      to_location_id: requireUuid(line.to_location_id, `Transfer line ${index + 1} destination location`),
      transfer_out_ledger_id: requireUuid(line.transfer_out_ledger_id, `Transfer line ${index + 1} outbound ledger`),
      transfer_in_ledger_id: requireUuid(line.transfer_in_ledger_id, `Transfer line ${index + 1} inbound ledger`),
      transfer_out_branch_id: requireUuid(line.transfer_out_branch_id, `Transfer line ${index + 1} outbound branch`),
      transfer_in_branch_id: requireUuid(line.transfer_in_branch_id, `Transfer line ${index + 1} inbound branch`),
      transfer_out_location_id: requireUuid(line.transfer_out_location_id, `Transfer line ${index + 1} outbound location`),
      transfer_in_location_id: requireUuid(line.transfer_in_location_id, `Transfer line ${index + 1} inbound location`),
      transfer_out_product_id: requireUuid(line.transfer_out_product_id, `Transfer line ${index + 1} outbound product`),
      transfer_in_product_id: requireUuid(line.transfer_in_product_id, `Transfer line ${index + 1} inbound product`),
      transfer_out_batch_id: requireUuid(line.transfer_out_batch_id, `Transfer line ${index + 1} outbound batch`),
      transfer_in_batch_id: requireUuid(line.transfer_in_batch_id, `Transfer line ${index + 1} inbound batch`),
      base_quantity: requirePositiveDecimal(line.base_quantity, `Transfer line ${index + 1} quantity`, positiveQuantityOptions),
      unit_cost: requirePositiveDecimal(line.unit_cost, `Transfer line ${index + 1} cost`, costOptions),
      extended_cost: requirePositiveDecimal(line.extended_cost, `Transfer line ${index + 1} value`, positiveMoneyOptions),
      transfer_out_quantity: normalizeAuthoritativeDecimal(line.transfer_out_quantity, `Transfer line ${index + 1} outbound quantity`, quantityOptions),
      transfer_out_unit_cost: normalizeAuthoritativeDecimal(line.transfer_out_unit_cost, `Transfer line ${index + 1} outbound cost`, costOptions),
      transfer_out_value: normalizeAuthoritativeDecimal(line.transfer_out_value, `Transfer line ${index + 1} outbound value`, moneyOptions),
      transfer_in_quantity: normalizeAuthoritativeDecimal(line.transfer_in_quantity, `Transfer line ${index + 1} inbound quantity`, quantityOptions),
      transfer_in_unit_cost: normalizeAuthoritativeDecimal(line.transfer_in_unit_cost, `Transfer line ${index + 1} inbound cost`, costOptions),
      transfer_in_value: normalizeAuthoritativeDecimal(line.transfer_in_value, `Transfer line ${index + 1} inbound value`, moneyOptions),
    })),
  };
  for (const [index, line] of decoded.lines.entries()) {
    if (line.transfer_out_branch_id !== decoded.branch_id
        || line.transfer_in_branch_id !== decoded.destination_branch_id
        || line.transfer_out_location_id !== line.from_location_id
        || line.transfer_in_location_id !== line.to_location_id
        || line.transfer_out_product_id !== line.product_id
        || line.transfer_in_product_id !== line.product_id
        || line.transfer_out_batch_id !== line.batch_id
        || line.transfer_in_batch_id !== line.batch_id
        || compareExactDecimals(line.transfer_out_unit_cost, line.unit_cost, `Transfer line ${index + 1} paired cost`, costOptions) !== 0
        || compareExactDecimals(line.transfer_in_unit_cost, line.unit_cost, `Transfer line ${index + 1} paired cost`, costOptions) !== 0
        || compareExactDecimals(line.transfer_out_quantity, `-${line.base_quantity}`, `Transfer line ${index + 1} paired quantity`, quantityOptions) !== 0
        || compareExactDecimals(line.transfer_in_quantity, line.base_quantity, `Transfer line ${index + 1} paired quantity`, quantityOptions) !== 0
        || compareExactDecimals(line.transfer_out_value, `-${line.extended_cost}`, `Transfer line ${index + 1} paired value`, moneyOptions) !== 0
        || compareExactDecimals(line.transfer_in_value, line.extended_cost, `Transfer line ${index + 1} paired value`, moneyOptions) !== 0) {
      throw new Error(`Transfer line ${index + 1} is not exactly quantity/value balanced.`);
    }
  }
  if (compareExactDecimals(
    addExactDecimals(decoded.lines.map((line) => line.base_quantity), 'Transfer line quantities', positiveQuantityOptions),
    decoded.total_abs_base_quantity,
    'Transfer header quantity',
    positiveQuantityOptions,
  ) !== 0 || compareExactDecimals(
    addExactDecimals(decoded.lines.map((line) => line.extended_cost), 'Transfer line values', positiveMoneyOptions),
    decoded.total_value,
    'Transfer header value',
    positiveMoneyOptions,
  ) !== 0) {
    throw new Error('Transfer header does not reconcile to exact line evidence.');
  }
  return decoded as TransferReadback;
}

export const inventoryTransfersApi = {
  eligibleBatches: (params: Record<string, string>) =>
    apiHelpers.get<EligibleTransferBatch[]>('/canonical/inventory-transfers/eligible-batches', {
      params,
      preserveExactDecimals: true,
    }),
  readback: async (inventoryDocumentId: string) => {
    requireUuid(inventoryDocumentId, 'Transfer');
    const response = await apiHelpers.get<TransferReadback>(
      `/canonical/inventory-transfers/${inventoryDocumentId}`,
      { preserveExactDecimals: true },
    );
    response.data = decodeTransferReadback(response.data);
    return response;
  },
};
