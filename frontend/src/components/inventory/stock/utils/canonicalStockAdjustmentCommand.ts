import { apiHelpers } from '../../../../services/api/apiClient';
import type {
  CanonicalCommandExecution,
  CanonicalCommandPreview,
} from '../../../../services/api/canonicalOperatorActions';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';

const DECIMAL_PATTERN = /^(0|[1-9]\d{0,13})(?:\.(\d{1,6}))?$/;
const MICRO = 1_000_000n;

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
  multiplier: string | number;
};

export type CycleCountEligibility = {
  branch_id: string;
  location_id: string;
  counted_by_membership_id: string;
  product_id: string;
  batch_id: string;
  system_base_quantity: string | number;
  uom_conversions: CycleCountUom[];
  evidence: CycleCountEvidence[];
};

export type CycleCountItem = {
  productId: string;
  batchId: string;
  branchId: string;
  locationId: string;
  uomConversionId: string;
  uomMultiplier: string | number;
  countedQuantity: string;
  systemBaseQuantity: string | number;
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
  status: 'posted';
  journal_status: 'posted';
  total_gain_base_quantity: string | number;
  total_gain_value: string | number;
  lines: Array<{
    product_id: string;
    batch_id: string;
    gain_base_quantity: string | number;
    gain_value: string | number;
    ledger_quantity_delta: string | number;
    ledger_value_delta: string | number;
    counted_base_quantity: string | number;
    current_on_hand_quantity: string | number;
  }>;
};

const requireCommandPreview = (preview: CanonicalCommandPreview): CanonicalCommandPreview => {
  if (!isCanonicalUuid(preview?.command_request_id) || !/^sha256:[0-9a-f]{64}$/i.test(preview?.preview_hash || '')) {
    throw new Error('Cycle-count review returned an invalid immutable command preview.');
  }
  return preview;
};

const decimalUnits = (value: string | number, field: string): bigint => {
  const text = String(value);
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) throw new Error(`${field} must be a non-negative decimal with at most six decimal places.`);
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * MICRO + BigInt(fraction.padEnd(6, '0'));
};

const multipliedBaseUnits = (quantity: string, multiplier: string | number): bigint => {
  const quantityUnits = decimalUnits(quantity, 'Physical count');
  const multiplierUnits = decimalUnits(multiplier, 'UOM multiplier');
  if (quantityUnits <= 0n || multiplierUnits <= 0n) {
    throw new Error('Physical count and UOM multiplier must be positive.');
  }
  const product = quantityUnits * multiplierUnits;
  return (product + MICRO / 2n) / MICRO;
};

export const indiaLocalDate = (instant: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
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
  decimalUnits(eligibility.system_base_quantity, 'System base quantity');
  if (!Array.isArray(eligibility.uom_conversions) || eligibility.uom_conversions.length === 0) {
    throw new Error('No eligible cycle-count UOM is configured for this product.');
  }
  if (!Array.isArray(eligibility.evidence) || eligibility.evidence.length === 0) {
    throw new Error('No unused verified cycle-count sheet is available for today.');
  }
  eligibility.uom_conversions.forEach((uom) => {
    if (!isCanonicalUuid(uom.uom_conversion_id)) throw new Error('Cycle-count UOM identity is invalid.');
    if (decimalUnits(uom.multiplier, 'UOM multiplier') <= 0n) throw new Error('Cycle-count UOM multiplier must be positive.');
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
  if (input.adjustmentDate !== indiaLocalDate(new Date(input.countedAt))) {
    throw new Error('Cycle count must use the India-local date of the physical count.');
  }
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
    const systemBaseUnits = decimalUnits(item.systemBaseQuantity, 'System base quantity');
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
    counted_at: input.countedAt,
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
    || readback.inventory_document_id !== execution.resource_id
    || readback.status !== 'posted'
    || readback.journal_status !== 'posted'
    || !Array.isArray(readback.lines)
    || readback.lines.length === 0
  ) {
    throw new Error('Cycle-count execution did not reconcile to posted stock and journal data.');
  }
  readback.lines.forEach((line) => {
    if (
      decimalUnits(line.gain_base_quantity, 'Gain quantity') !== decimalUnits(line.ledger_quantity_delta, 'Ledger quantity')
      || decimalUnits(line.gain_value, 'Gain value') !== decimalUnits(line.ledger_value_delta, 'Ledger value')
      || decimalUnits(line.counted_base_quantity, 'Counted quantity') !== decimalUnits(line.current_on_hand_quantity, 'Current stock')
    ) {
      throw new Error('Cycle-count readback differs from its posted ledger evidence.');
    }
  });
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
  return response.data;
};
