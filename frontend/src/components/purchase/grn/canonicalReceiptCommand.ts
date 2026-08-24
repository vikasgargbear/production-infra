import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import type {
  CanonicalReceiptContext,
  CanonicalReceiptContextLine,
} from '../../../services/api/modules/purchase/canonicalGoodsReceipts.api';


export type ReceiptQcStatus = 'accepted' | 'partial';

export interface CanonicalReceiptBatchDraft {
  manufacturerBatchNumber: string;
  manufacturedOn: string;
  expiresOn: string;
  mrp: string;
  mrpUomConversionId: string;
  receivedQuantity: string;
  acceptedQuantity: string;
  rejectedQuantity: string;
  freeQuantity: string;
  qcStatus: ReceiptQcStatus;
  qcNotes: string;
  toLocationId: string;
}

export interface CanonicalReceiptLineDraft {
  purchaseOrderLineId: string;
  included: boolean;
  batches: CanonicalReceiptBatchDraft[];
}

export interface CanonicalReceiptDraft {
  idempotencyKey: string;
  receivedAt: string;
  supplierChallanNumber: string;
  supplierChallanDate: string;
  lines: CanonicalReceiptLineDraft[];
}

interface ExactDecimal {
  canonical: string;
  scaled: bigint;
}

export function canRecordCanonicalReceipt(status: unknown): boolean {
  return ['approved', 'partially_received'].includes(String(status || '').toLowerCase());
}

function exactDecimal(
  value: string,
  label: string,
  maximumWholeDigits = 14,
  maximumFractionDigits = 6,
): ExactDecimal {
  const canonical = value.trim();
  const pattern = new RegExp(
    `^(?:0|[1-9][0-9]{0,${maximumWholeDigits - 1}})(?:\\.[0-9]{1,${maximumFractionDigits}})?$`,
  );
  if (!pattern.test(canonical)) {
    throw new Error(
      `${label} must be a nonnegative decimal with at most ${maximumFractionDigits} places`,
    );
  }
  const [whole, fraction = ''] = canonical.split('.');
  return {
    canonical,
    scaled: BigInt(`${whole}${fraction.padEnd(maximumFractionDigits, '0')}`),
  };
}

function organizationTimestamp(localValue: string, timeZone: string): string {
  const explicitTimestamp = localValue.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
    explicitTimestamp,
  )) {
    if (Number.isNaN(new Date(explicitTimestamp).getTime())) {
      throw new Error('Receipt date and time is required');
    }
    return explicitTimestamp;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    explicitTimestamp,
  );
  if (!match) throw new Error('Receipt date and time is required');
  const [, year, month, day, hour, minute, second = '00'] = match;
  const wallClockUtc = Date.UTC(
    Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second),
  );
  const wallClock = new Date(wallClockUtc);
  if (
    wallClock.getUTCFullYear() !== Number(year)
    || wallClock.getUTCMonth() !== Number(month) - 1
    || wallClock.getUTCDate() !== Number(day)
    || wallClock.getUTCHours() !== Number(hour)
    || wallClock.getUTCMinutes() !== Number(minute)
    || wallClock.getUTCSeconds() !== Number(second)
  ) {
    throw new Error('Receipt date and time is required');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(wallClockUtc));
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find(item => item.type === type)?.value || ''
  );
  const zoneClockUtc = Date.UTC(
    Number(part('year')), Number(part('month')) - 1, Number(part('day')),
    Number(part('hour')), Number(part('minute')), Number(part('second')),
  );
  const offsetMinutes = Math.round((zoneClockUtc - wallClockUtc) / 60_000);
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offsetHour = String(Math.floor(absoluteOffset / 60)).padStart(2, '0');
  const offsetMinute = String(absoluteOffset % 60).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offsetSign}${offsetHour}:${offsetMinute}`;
}

export function organizationDateTimeInputValue(
  value: Date,
  timeZone: string,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find(item => item.type === type)?.value || ''
  );
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function requireContextLine(
  context: CanonicalReceiptContext,
  id: string,
): CanonicalReceiptContextLine {
  const line = context.lines.find(item => item.purchase_order_line_id === id);
  if (!line) throw new Error('Receipt line is not part of the reviewed purchase order context');
  return line;
}

export function initialReceiptDraft(
  context: CanonicalReceiptContext,
  idempotencyKey: string,
  now = new Date(),
): CanonicalReceiptDraft {
  const safeReceivedAt = new Date(now.getTime() - 60_000);
  return {
    idempotencyKey,
    receivedAt: organizationDateTimeInputValue(safeReceivedAt, context.organization_timezone),
    supplierChallanNumber: '',
    supplierChallanDate: '',
    lines: context.lines.map(line => ({
      purchaseOrderLineId: line.purchase_order_line_id,
      included: true,
      batches: [initialReceiptBatchDraft(line, true)],
    })),
  };
}

export function initialReceiptBatchDraft(
  line: CanonicalReceiptContextLine,
  includeRemainingQuantities = false,
): CanonicalReceiptBatchDraft {
  return {
    manufacturerBatchNumber: '',
    manufacturedOn: '',
    expiresOn: '',
    mrp: '',
    mrpUomConversionId: line.mrp_conversions[0]?.id || '',
    receivedQuantity: includeRemainingQuantities ? line.remaining_billed_quantity : '0',
    acceptedQuantity: includeRemainingQuantities ? line.remaining_billed_quantity : '0',
    rejectedQuantity: '0',
    freeQuantity: includeRemainingQuantities ? line.remaining_free_quantity : '0',
    qcStatus: 'accepted',
    qcNotes: '',
    toLocationId: line.eligible_locations[0]?.id || '',
  };
}

export function buildCanonicalReceiptPayload(
  context: CanonicalReceiptContext,
  draft: CanonicalReceiptDraft,
  now = new Date(),
): Record<string, unknown> {
  if (!canRecordCanonicalReceipt(context.status)) {
    throw new Error('Purchase order is no longer eligible for a canonical receipt');
  }
  if (![context.purchase_order_id, context.branch_id, context.supplier_account_id]
    .every(isCanonicalUuid)) {
    throw new Error('Canonical purchase order context contains an invalid identity');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(draft.idempotencyKey)) {
    throw new Error('Receipt retry identity is invalid');
  }

  let receivedAt: string;
  try {
    receivedAt = organizationTimestamp(draft.receivedAt, context.organization_timezone);
  } catch (error) {
    throw new Error(
      error instanceof RangeError
        ? 'The organization timezone is invalid'
        : 'Receipt date and time is required',
    );
  }
  if (new Date(receivedAt).getTime() > now.getTime()) {
    throw new Error('Receipt date and time cannot be in the future');
  }

  const challanNumber = draft.supplierChallanNumber.trim();
  const challanDate = draft.supplierChallanDate.trim();
  if (Boolean(challanNumber) !== Boolean(challanDate)) {
    throw new Error('Supplier challan number and date must be provided together');
  }
  if (challanDate && challanDate > draft.receivedAt.slice(0, 10)) {
    throw new Error('Supplier challan date cannot follow physical receipt');
  }

  const included = draft.lines.filter(line => line.included);
  if (!included.length) throw new Error('Select at least one purchase order line to receive');

  const seenPurchaseOrderLines = new Set<string>();
  const lines = included.map((lineDraft, index) => {
    const source = requireContextLine(context, lineDraft.purchaseOrderLineId);
    const label = `Line ${source.line_number}`;
    if (!isCanonicalUuid(source.purchase_order_line_id) || !isCanonicalUuid(source.product_id)) {
      throw new Error(`${label} contains an invalid canonical identity`);
    }
    if (seenPurchaseOrderLines.has(source.purchase_order_line_id)) {
      throw new Error(`${label} repeats a purchase-order line`);
    }
    seenPurchaseOrderLines.add(source.purchase_order_line_id);
    const remainingBilled = exactDecimal(
      source.remaining_billed_quantity,
      `${label} remaining billed quantity`,
    );
    const remainingFree = exactDecimal(
      source.remaining_free_quantity,
      `${label} remaining free quantity`,
    );
    if (!lineDraft.batches.length) throw new Error(`${label} requires at least one batch`);
    const seenBatchNumbers = new Set<string>();
    let totalAccepted = 0n;
    let totalFree = 0n;
    const batches = lineDraft.batches.map((batchDraft, batchIndex) => {
      const batchLabel = `${label} batch ${batchIndex + 1}`;
      const received = exactDecimal(
        batchDraft.receivedQuantity,
        `${batchLabel} received quantity`,
      );
      const accepted = exactDecimal(
        batchDraft.acceptedQuantity,
        `${batchLabel} accepted quantity`,
      );
      const rejected = exactDecimal(
        batchDraft.rejectedQuantity,
        `${batchLabel} rejected quantity`,
      );
      const free = exactDecimal(batchDraft.freeQuantity, `${batchLabel} free quantity`);
      const mrp = exactDecimal(batchDraft.mrp, `${batchLabel} MRP`, 18, 2);
      if (received.scaled <= 0n) {
        throw new Error(`${batchLabel} received quantity must be positive`);
      }
      if (accepted.scaled + rejected.scaled !== received.scaled) {
        throw new Error(`${batchLabel} accepted plus rejected must equal received`);
      }
      if (accepted.scaled + free.scaled <= 0n) {
        throw new Error(`${batchLabel} cannot be fully rejected`);
      }
      if (batchDraft.qcStatus === 'accepted'
        && (rejected.scaled !== 0n || accepted.scaled !== received.scaled)) {
        throw new Error(`${batchLabel} accepted QC requires zero rejected quantity`);
      }
      if (batchDraft.qcStatus === 'partial'
        && (accepted.scaled <= 0n || rejected.scaled <= 0n || !batchDraft.qcNotes.trim())) {
        throw new Error(
          `${batchLabel} partial QC requires accepted and rejected quantities plus notes`,
        );
      }
      const manufacturerBatchNumber = batchDraft.manufacturerBatchNumber.trim();
      if (!manufacturerBatchNumber) {
        throw new Error(`${batchLabel} manufacturer batch number is required`);
      }
      const normalizedBatchNumber = manufacturerBatchNumber.toLocaleUpperCase('en-IN');
      if (seenBatchNumbers.has(normalizedBatchNumber)) {
        throw new Error(`${label} repeats manufacturer batch ${manufacturerBatchNumber}`);
      }
      seenBatchNumbers.add(normalizedBatchNumber);
      if (!batchDraft.expiresOn) throw new Error(`${batchLabel} expiry date is required`);
      const receiptDate = draft.receivedAt.slice(0, 10);
      if (batchDraft.expiresOn <= receiptDate) {
        throw new Error(`${batchLabel} expiry must be after physical receipt`);
      }
      if (batchDraft.manufacturedOn && batchDraft.manufacturedOn > receiptDate) {
        throw new Error(`${batchLabel} manufacture date cannot follow physical receipt`);
      }
      if (mrp.scaled <= 0n) throw new Error(`${batchLabel} MRP must be positive`);
      if (!source.mrp_conversions.some(item => item.id === batchDraft.mrpUomConversionId)) {
        throw new Error(`${batchLabel} MRP unit is not in the canonical purchase context`);
      }
      if (!isCanonicalUuid(batchDraft.mrpUomConversionId)) {
        throw new Error(`${batchLabel} MRP unit has an invalid canonical identity`);
      }
      if (!source.eligible_locations.some(item => item.id === batchDraft.toLocationId)) {
        throw new Error(`${batchLabel} destination is not eligible for this product`);
      }
      if (!isCanonicalUuid(batchDraft.toLocationId)) {
        throw new Error(`${batchLabel} destination has an invalid canonical identity`);
      }
      totalAccepted += accepted.scaled;
      totalFree += free.scaled;
      return {
        manufacturer_batch_number: manufacturerBatchNumber,
        ...(batchDraft.manufacturedOn ? { manufactured_on: batchDraft.manufacturedOn } : {}),
        expires_on: batchDraft.expiresOn,
        mrp: mrp.canonical,
        mrp_uom_conversion_id: batchDraft.mrpUomConversionId,
        received_quantity: received.canonical,
        accepted_quantity: accepted.canonical,
        rejected_quantity: rejected.canonical,
        free_quantity: free.canonical,
        qc_status: batchDraft.qcStatus,
        ...(batchDraft.qcNotes.trim() ? { qc_notes: batchDraft.qcNotes.trim() } : {}),
        to_location_id: batchDraft.toLocationId,
      };
    });
    if (totalAccepted > remainingBilled.scaled) {
      throw new Error(`${label} accepted quantity exceeds the remaining billed PO quantity`);
    }
    if (totalFree > remainingFree.scaled) {
      throw new Error(`${label} free quantity exceeds the remaining free PO quantity`);
    }

    return {
      purchase_order_line_id: source.purchase_order_line_id,
      batches,
    };
  });

  return {
    idempotency_key: draft.idempotencyKey,
    branch_id: context.branch_id,
    received_at: receivedAt,
    purchase_order_id: context.purchase_order_id,
    supplier_account_id: context.supplier_account_id,
    ...(challanNumber ? {
      supplier_challan_number: challanNumber,
      supplier_challan_date: challanDate,
    } : {}),
    lines,
  };
}
