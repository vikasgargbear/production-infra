import type { EligibleTransferBatch } from '../../../../services/api/modules/inventory/inventoryTransfers.api';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import {
  compareExactDecimals,
  exactDecimalString,
  exactDecimalUnits,
  normalizeAuthoritativeDecimal,
  normalizeExactDecimal,
} from '../../../../utils/exactDecimal';

export const transferQuantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const transferMoneyOptions = { scale: 2, maximumWholeDigits: 20 } as const;
const transferCostOptions = { scale: 4, maximumWholeDigits: 16 } as const;

export function normalizeEligibleTransferBatches(value: unknown): EligibleTransferBatch[] {
  if (!Array.isArray(value)) throw new Error('Eligible transfer batches must be an array.');
  const rows = value.map((row, index) => {
    if (!row || typeof row !== 'object') throw new Error(`Eligible batch ${index + 1} is invalid.`);
    const batch = row as EligibleTransferBatch;
    if (!isCanonicalUuid(batch.batch_id) || !isCanonicalUuid(batch.product_id)
      || !isCanonicalUuid(batch.uom_conversion_id)) {
      throw new Error(`Eligible batch ${index + 1} is missing a canonical UUID.`);
    }
    if (typeof batch.batch_number !== 'string' || !batch.batch_number.trim()
      || !/^\d{4}-\d{2}-\d{2}$/.test(String(batch.expires_on))) {
      throw new Error(`Eligible batch ${index + 1} has invalid identity or expiry.`);
    }
    return {
      ...batch,
      uom_multiplier: normalizeAuthoritativeDecimal(batch.uom_multiplier, `Eligible batch ${index + 1} UOM multiplier`, transferQuantityOptions),
      available_base_quantity: normalizeAuthoritativeDecimal(batch.available_base_quantity, `Eligible batch ${index + 1} base quantity`, transferQuantityOptions),
      available_selected_quantity: normalizeAuthoritativeDecimal(batch.available_selected_quantity, `Eligible batch ${index + 1} selected quantity`, transferQuantityOptions),
      average_unit_cost: normalizeAuthoritativeDecimal(batch.average_unit_cost, `Eligible batch ${index + 1} average unit cost`, transferCostOptions),
      inventory_value: normalizeAuthoritativeDecimal(batch.inventory_value, `Eligible batch ${index + 1} inventory value`, transferMoneyOptions),
    };
  });
  if (rows.length && rows.some((row) => row.expires_on !== rows[0].expires_on)) {
    throw new Error('Eligible batches must stay within one earliest-expiry FEFO tier.');
  }
  if (new Set(rows.map((row) => row.batch_id)).size !== rows.length) {
    throw new Error('Eligible batches contain a duplicate canonical batch identity.');
  }
  if (rows.filter((row) => row.is_default).length !== (rows.length ? 1 : 0)) {
    throw new Error('Eligible batches require exactly one deterministic FEFO default.');
  }
  return rows;
}

export function defaultTransferQuantity(batch: EligibleTransferBatch): string {
  const available = normalizeAuthoritativeDecimal(batch.available_selected_quantity, 'Available transfer quantity', transferQuantityOptions);
  return compareExactDecimals(available, '1', 'Default transfer quantity', transferQuantityOptions) < 0
    ? available
    : normalizeExactDecimal('1', 'Default transfer quantity', transferQuantityOptions);
}

export function validateTransferQuantity(value: unknown, available: unknown, label: string): string {
  const quantity = normalizeExactDecimal(value, label, transferQuantityOptions);
  const stock = normalizeAuthoritativeDecimal(available, `${label} available stock`, transferQuantityOptions);
  if (compareExactDecimals(quantity, '0', label, transferQuantityOptions) <= 0
    || compareExactDecimals(quantity, stock, label, transferQuantityOptions) > 0) {
    throw new Error(`${label} must be positive and within available FEFO stock.`);
  }
  return quantity;
}

export interface ProposedTransferAllocation {
  batch_id: string;
  entered_quantity: string;
}

/** Deterministically fill the server-provided, equally earliest-expiry tier without floats. */
export function proposeFefoAllocations(
  requested: unknown,
  batches: readonly EligibleTransferBatch[],
): ProposedTransferAllocation[] {
  const requestedQuantity = normalizeExactDecimal(
    requested,
    'Requested transfer quantity',
    transferQuantityOptions,
  );
  let remaining = exactDecimalUnits(
    requestedQuantity,
    'Requested transfer quantity',
    transferQuantityOptions,
  );
  if (remaining <= 0n) throw new Error('Requested transfer quantity must be positive.');
  const allocations: ProposedTransferAllocation[] = [];
  for (const batch of batches) {
    const available = exactDecimalUnits(
      normalizeAuthoritativeDecimal(
        batch.available_selected_quantity,
        'Eligible batch quantity',
        transferQuantityOptions,
      ),
      'Eligible batch quantity',
      transferQuantityOptions,
    );
    const allocated = remaining < available ? remaining : available;
    if (allocated > 0n) {
      allocations.push({
        batch_id: batch.batch_id,
        entered_quantity: exactDecimalString(allocated, transferQuantityOptions.scale),
      });
      remaining -= allocated;
    }
    if (remaining === 0n) break;
  }
  if (remaining !== 0n) {
    throw new Error('Requested quantity exceeds the available earliest-expiry FEFO tier.');
  }
  return allocations;
}
