import { apiHelpers } from '../../../../services/api/apiClient';
import type {
  CanonicalCommandExecution,
  CanonicalCommandPreview,
} from '../../../../services/api/canonicalOperatorActions';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import { exactDecimalUnits } from '../../../../utils/exactDecimal';
import { requireCanonicalUtcEventTimestamp } from './canonicalEventTimestamp';

const MICRO = 1_000_000n;
const MAX_QUANTITY_UNITS = (10n ** 20n) - 1n;
const QUANTITY_OPTIONS = { scale: 6, maximumWholeDigits: 14 } as const;
const MONEY_OPTIONS = { scale: 2, maximumWholeDigits: 18 } as const;
const UNIT_COST_OPTIONS = { scale: 4, maximumWholeDigits: 16 } as const;

export type CycleCountEvidence = {
  evidence_attachment_id: string;
  status: 'verified' | 'retained';
  document_date: string;
  verified_at: string;
  retention_until: string;
};

export type CycleCountUom = {
  uom_conversion_id: string;
  from_uom_code: string;
  to_uom_code: string;
  multiplier: string;
};

export type CycleCountEligibility = {
  branch_id: string;
  location_id: string;
  counted_by_membership_id: string;
  product_id: string;
  batch_id: string;
  system_base_quantity: string;
  uom_conversions: CycleCountUom[];
  evidence: CycleCountEvidence[];
};

export type CycleCountItem = {
  productId: string;
  batchId: string;
  branchId: string;
  locationId: string;
  uomConversionId: string;
  uomMultiplier: string;
  countedQuantity: string;
  systemBaseQuantity: string;
};

export type CycleCountCommandInput = {
  idempotencyKey: string;
  adjustmentDate: string;
  countedAt: string;
  countedByMembershipId: string;
  evidenceAttachmentId: string;
  items: CycleCountItem[];
};

export type CycleCountReadback = {
  command_request_id: string;
  inventory_document_id: string;
  document_number: string;
  branch_id: string;
  status: 'posted';
  journal_entry_id: string;
  journal_status: 'posted';
  journal_debit_total: string;
  journal_credit_total: string;
  accounting_event_id: string;
  total_gain_base_quantity: string;
  total_gain_value: string;
  lines: Array<{
    inventory_document_line_id: string;
    product_id: string;
    batch_id: string;
    ledger_entry_id: string;
    system_base_quantity: string;
    counted_base_quantity: string;
    gain_base_quantity: string;
    unit_cost: string;
    gain_value: string;
    ledger_quantity_delta: string;
    ledger_value_delta: string;
    current_on_hand_quantity: string;
  }>;
};

const requireCommandPreview = (preview: CanonicalCommandPreview): CanonicalCommandPreview => {
  if (!isCanonicalUuid(preview?.command_request_id) || !/^sha256:[0-9a-f]{64}$/i.test(preview?.preview_hash || '')) {
    throw new Error('Cycle-count review returned an invalid immutable command preview.');
  }
  return preview;
};

const exactStringUnits = (
  value: unknown,
  field: string,
  options: typeof QUANTITY_OPTIONS | typeof MONEY_OPTIONS | typeof UNIT_COST_OPTIONS,
): bigint => {
  if (typeof value !== 'string' || value.trim() !== value) {
    throw new Error(`${field} must remain an exact decimal string.`);
  }
  return exactDecimalUnits(value, field, options);
};

const quantityUnits = (value: unknown, field: string): bigint => (
  exactStringUnits(value, field, QUANTITY_OPTIONS)
);

const moneyUnits = (value: unknown, field: string): bigint => (
  exactStringUnits(value, field, MONEY_OPTIONS)
);

const unitCostUnits = (value: unknown, field: string): bigint => (
  exactStringUnits(value, field, UNIT_COST_OPTIONS)
);

const multipliedBaseUnits = (quantity: string, multiplier: string): bigint => {
  const inputUnits = quantityUnits(quantity, 'Physical count');
  const multiplierUnits = quantityUnits(multiplier, 'UOM multiplier');
  if (inputUnits <= 0n || multiplierUnits <= 0n) {
    throw new Error('Physical count and UOM multiplier must be positive.');
  }
  const product = inputUnits * multiplierUnits;
  const rounded = (product + MICRO / 2n) / MICRO;
  if (rounded > MAX_QUANTITY_UNITS) {
    throw new Error('Physical count in base units exceeds the canonical numeric(20,6) boundary.');
  }
  return rounded;
};

export const loadCycleCountEligibility = async (params: {
  branchId: string;
  locationId: string;
  batchId: string;
  adjustmentDate: string;
}): Promise<CycleCountEligibility> => {
  const response = await apiHelpers.get<CycleCountEligibility>(
    '/web/actions/inventory-adjustment/eligibility',
    {
      params: {
        branch_id: params.branchId,
        location_id: params.locationId,
        batch_id: params.batchId,
        adjustment_date: params.adjustmentDate,
      },
    },
  );
  const eligibility = response.data;
  for (const [field, value] of [
    ['branch_id', eligibility?.branch_id],
    ['location_id', eligibility?.location_id],
    ['counted_by_membership_id', eligibility?.counted_by_membership_id],
    ['product_id', eligibility?.product_id],
    ['batch_id', eligibility?.batch_id],
  ]) {
    if (!isCanonicalUuid(value)) throw new Error(`Cycle-count eligibility returned invalid ${field}.`);
  }
  if (quantityUnits(eligibility.system_base_quantity, 'System base quantity') <= 0n) {
    throw new Error('System base quantity must be positive.');
  }
  if (!Array.isArray(eligibility.uom_conversions) || eligibility.uom_conversions.length === 0) {
    throw new Error('No eligible cycle-count UOM is configured for this product.');
  }
  if (!Array.isArray(eligibility.evidence) || eligibility.evidence.length === 0) {
    throw new Error('No unused verified cycle-count sheet is available for today.');
  }
  eligibility.uom_conversions.forEach((uom) => {
    if (!isCanonicalUuid(uom.uom_conversion_id)) throw new Error('Cycle-count UOM identity is invalid.');
    if (quantityUnits(uom.multiplier, 'UOM multiplier') <= 0n) throw new Error('Cycle-count UOM multiplier must be positive.');
  });
  eligibility.evidence.forEach((item) => {
    if (!isCanonicalUuid(item.evidence_attachment_id)) throw new Error('Cycle-count evidence identity is invalid.');
  });
  return eligibility;
};

export const buildCycleCountGainPayload = (input: CycleCountCommandInput): Record<string, unknown> => {
  if (!/^erp-web-inventory-adjustment-prepare:[A-Za-z0-9-]{8,}$/.test(input.idempotencyKey)) {
    throw new Error('Cycle-count idempotency identity is invalid.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.adjustmentDate)) {
    throw new Error('Cycle count requires the canonical organization business date.');
  }
  const countedAt = requireCanonicalUtcEventTimestamp(input.countedAt, 'Physical count time');
  if (!isCanonicalUuid(input.countedByMembershipId) || !isCanonicalUuid(input.evidenceAttachmentId)) {
    throw new Error('Cycle-count membership and evidence are required from the live API.');
  }
  if (input.items.length === 0) throw new Error('Add at least one fully resolved cycle-count batch.');
  const branchIds = new Set(input.items.map(item => item.branchId));
  const locationIds = new Set(input.items.map(item => item.locationId));
  const batchIds = new Set(input.items.map(item => item.batchId));
  if (branchIds.size !== 1 || locationIds.size !== 1) {
    throw new Error('One cycle-count command can cover only one branch and saleable location.');
  }
  if (batchIds.size !== input.items.length) throw new Error('Each batch may appear only once in a cycle count.');

  const grouped = new Map<string, { product_id: string; uom_conversion_id: string; batch_counts: Array<{ batch_id: string; counted_quantity: string }> }>();
  input.items.forEach((item) => {
    for (const [field, value] of [
      ['product_id', item.productId], ['batch_id', item.batchId],
      ['branch_id', item.branchId], ['location_id', item.locationId],
      ['uom_conversion_id', item.uomConversionId],
    ]) {
      if (!isCanonicalUuid(value)) throw new Error(`Cycle-count item has invalid ${field}.`);
    }
    const countedBaseUnits = multipliedBaseUnits(item.countedQuantity, item.uomMultiplier);
    const systemBaseUnits = quantityUnits(item.systemBaseQuantity, 'System base quantity');
    if (countedBaseUnits <= systemBaseUnits) {
      throw new Error('This pilot supports only a positive cycle-count gain; counted stock must exceed system stock.');
    }
    const key = `${item.productId}:${item.uomConversionId}`;
    const line = grouped.get(key) || {
      product_id: item.productId,
      uom_conversion_id: item.uomConversionId,
      batch_counts: [],
    };
    line.batch_counts.push({ batch_id: item.batchId, counted_quantity: item.countedQuantity });
    grouped.set(key, line);
  });

  return {
    idempotency_key: input.idempotencyKey,
    branch_id: input.items[0].branchId,
    adjustment_date: input.adjustmentDate,
    counted_at: countedAt,
    counted_by_membership_id: input.countedByMembershipId,
    location_id: input.items[0].locationId,
    reason_code: 'cycle_count',
    evidence_attachment_id: input.evidenceAttachmentId,
    lines: Array.from(grouped.values()),
  };
};

export const loadAndVerifyCycleCountReadback = async (
  preview: CanonicalCommandPreview,
  execution: CanonicalCommandExecution,
): Promise<CycleCountReadback> => {
  const response = await apiHelpers.get<CycleCountReadback>(
    `/web/actions/inventory-adjustment/commands/${preview.command_request_id}/readback`,
  );
  const readback = response.data;
  if (
    readback.command_request_id !== preview.command_request_id
    || !isCanonicalUuid(readback.inventory_document_id)
    || readback.inventory_document_id !== execution.resource_id
    || !readback.document_number
    || !isCanonicalUuid(readback.branch_id)
    || !isCanonicalUuid(readback.journal_entry_id)
    || !isCanonicalUuid(readback.accounting_event_id)
    || readback.status !== 'posted'
    || readback.journal_status !== 'posted'
    || !Array.isArray(readback.lines)
    || readback.lines.length === 0
  ) {
    throw new Error('Cycle-count execution did not reconcile to posted stock and journal data.');
  }
  const totalGainQuantity = quantityUnits(readback.total_gain_base_quantity, 'Total gain quantity');
  const totalGainValue = moneyUnits(readback.total_gain_value, 'Total gain value');
  if (
    totalGainQuantity <= 0n
    || totalGainValue <= 0n
    || moneyUnits(readback.journal_debit_total, 'Journal debit total') !== totalGainValue
    || moneyUnits(readback.journal_credit_total, 'Journal credit total') !== totalGainValue
  ) {
    throw new Error('Cycle-count totals do not reconcile to the posted valuation journal.');
  }
  let lineGainQuantity = 0n;
  let lineGainValue = 0n;
  readback.lines.forEach((line) => {
    if (
      !isCanonicalUuid(line.inventory_document_line_id)
      || !isCanonicalUuid(line.product_id)
      || !isCanonicalUuid(line.batch_id)
      || !isCanonicalUuid(line.ledger_entry_id)
    ) {
      throw new Error('Cycle-count readback returned an invalid canonical line identity.');
    }
    const systemQuantity = quantityUnits(line.system_base_quantity, 'System quantity');
    const countedQuantity = quantityUnits(line.counted_base_quantity, 'Counted quantity');
    const gainQuantity = quantityUnits(line.gain_base_quantity, 'Gain quantity');
    const gainValue = moneyUnits(line.gain_value, 'Gain value');
    const unitCost = unitCostUnits(line.unit_cost, 'Unit cost');
    if (
      gainQuantity <= 0n
      || gainValue <= 0n
      || unitCost <= 0n
      || countedQuantity !== systemQuantity + gainQuantity
      || gainQuantity !== quantityUnits(line.ledger_quantity_delta, 'Ledger quantity')
      || gainValue !== moneyUnits(line.ledger_value_delta, 'Ledger value')
      || countedQuantity !== quantityUnits(line.current_on_hand_quantity, 'Current stock')
    ) {
      throw new Error('Cycle-count readback differs from its posted ledger evidence.');
    }
    lineGainQuantity += gainQuantity;
    lineGainValue += gainValue;
  });
  if (lineGainQuantity !== totalGainQuantity || lineGainValue !== totalGainValue) {
    throw new Error('Cycle-count document totals differ from its posted line evidence.');
  }
  return readback;
};

export const loadCycleCountReview = async (commandRequestId: string): Promise<CanonicalCommandPreview> => {
  if (!isCanonicalUuid(commandRequestId)) throw new Error('Enter a canonical cycle-count command UUID.');
  const response = await apiHelpers.get<CanonicalCommandPreview>(
    `/web/actions/inventory-adjustment/commands/${commandRequestId}/review`,
  );
  return requireCommandPreview(response.data);
};

export const approveCycleCountReview = async (
  preview: CanonicalCommandPreview,
): Promise<void> => {
  requireCommandPreview(preview);
  await apiHelpers.post(
    `/web/actions/commands/${preview.command_request_id}/approve`,
    {
      preview_hash: preview.preview_hash,
      approval_intent: 'approve',
      idempotency_key: `erp-web-inventory-adjustment-approve:${preview.command_request_id}`,
    },
  );
};

export const executeApprovedCycleCount = async (
  preview: CanonicalCommandPreview,
): Promise<CanonicalCommandExecution> => {
  requireCommandPreview(preview);
  const response = await apiHelpers.post<CanonicalCommandExecution>(
    `/web/actions/commands/${preview.command_request_id}/execute`,
    {
      preview_hash: preview.preview_hash,
      idempotency_key: `erp-web-inventory-adjustment-execute:${preview.command_request_id}`,
    },
  );
  if (!response.data || !['executed', 'succeeded'].includes(response.data.status)) {
    throw new Error('Cycle-count command did not reach a terminal succeeded state.');
  }
  if (
    !isCanonicalUuid(response.data.resource_id)
    || ('command_request_id' in response.data && response.data.command_request_id !== preview.command_request_id)
    || ('idempotency_replayed' in response.data && typeof response.data.idempotency_replayed !== 'boolean')
  ) {
    throw new Error('Cycle-count execution returned an invalid idempotent command result.');
  }
  return response.data;
};
