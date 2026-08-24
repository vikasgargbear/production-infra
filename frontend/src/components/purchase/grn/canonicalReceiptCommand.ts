import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import type {
  CanonicalReceiptContext,
  CanonicalReceiptContextLine,
} from '../../../services/api/modules/purchase/canonicalGoodsReceipts.api';


export type ReceiptQcStatus = 'accepted' | 'partial';

export interface CanonicalReceiptLineDraft {
  purchaseOrderLineId: string;
  included: boolean;
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

export interface CanonicalReceiptDraft {
  idempotencyKey: string;
  receivedAt: string;
  supplierChallanNumber: string;
  supplierChallanDate: string;
  lines: CanonicalReceiptLineDraft[];
}

export function canRecordCanonicalReceipt(status: unknown): boolean {
  return ['approved', 'partially_received'].includes(String(status || '').toLowerCase());
}

function decimal(value: string, label: string): number {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value.trim())) {
    throw new Error(`${label} must be a positive decimal with up to 6 places`);
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} is invalid`);
  return parsed;
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
  const safeReceivedAt = new Date(now.getTime() - 60_000).toISOString();
  return {
    idempotencyKey,
    receivedAt: safeReceivedAt,
    supplierChallanNumber: '',
    supplierChallanDate: '',
    lines: context.lines.map(line => ({
      purchaseOrderLineId: line.purchase_order_line_id,
      included: true,
      manufacturerBatchNumber: '',
      manufacturedOn: '',
      expiresOn: '',
      mrp: '',
      mrpUomConversionId: line.mrp_conversions[0]?.id || '',
      receivedQuantity: line.remaining_billed_quantity,
      acceptedQuantity: line.remaining_billed_quantity,
      rejectedQuantity: '0',
      freeQuantity: line.remaining_free_quantity,
      qcStatus: 'accepted',
      qcNotes: '',
      toLocationId: line.eligible_locations[0]?.id || '',
    })),
  };
}

export function buildCanonicalReceiptPayload(
  context: CanonicalReceiptContext,
  draft: CanonicalReceiptDraft,
  now = new Date(),
): Record<string, unknown> {
  if (![context.purchase_order_id, context.branch_id, context.supplier_account_id]
    .every(isCanonicalUuid)) {
    throw new Error('Canonical purchase order context contains an invalid identity');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(draft.idempotencyKey)) {
    throw new Error('Receipt retry identity is invalid');
  }

  const receivedAt = new Date(draft.receivedAt);
  if (Number.isNaN(receivedAt.getTime())) throw new Error('Receipt date and time is required');
  if (receivedAt.getTime() > now.getTime()) throw new Error('Receipt date and time cannot be in the future');

  const challanNumber = draft.supplierChallanNumber.trim();
  const challanDate = draft.supplierChallanDate.trim();
  if (Boolean(challanNumber) !== Boolean(challanDate)) {
    throw new Error('Supplier challan number and date must be provided together');
  }
  if (challanDate && challanDate > receivedAt.toISOString().slice(0, 10)) {
    throw new Error('Supplier challan date cannot follow physical receipt');
  }

  const included = draft.lines.filter(line => line.included);
  if (!included.length) throw new Error('Select at least one purchase order line to receive');

  const lines = included.map((lineDraft, index) => {
    const source = requireContextLine(context, lineDraft.purchaseOrderLineId);
    const label = `Line ${source.line_number}`;
    const received = decimal(lineDraft.receivedQuantity, `${label} received quantity`);
    const accepted = decimal(lineDraft.acceptedQuantity, `${label} accepted quantity`);
    const rejected = decimal(lineDraft.rejectedQuantity, `${label} rejected quantity`);
    const free = decimal(lineDraft.freeQuantity, `${label} free quantity`);
    const mrp = decimal(lineDraft.mrp, `${label} MRP`);

    if (received <= 0) throw new Error(`${label} received quantity must be positive`);
    if (accepted < 0 || rejected < 0 || free < 0) {
      throw new Error(`${label} quantities cannot be negative`);
    }
    if (Math.abs(accepted + rejected - received) > 0.0000005) {
      throw new Error(`${label} accepted plus rejected must equal received`);
    }
    if (accepted + free <= 0) throw new Error(`${label} cannot be fully rejected`);
    if (accepted > Number(source.remaining_billed_quantity) + 0.0000005) {
      throw new Error(`${label} accepted quantity exceeds the remaining billed PO quantity`);
    }
    if (free > Number(source.remaining_free_quantity) + 0.0000005) {
      throw new Error(`${label} free quantity exceeds the remaining free PO quantity`);
    }
    if (lineDraft.qcStatus === 'accepted' && (rejected !== 0 || accepted !== received)) {
      throw new Error(`${label} accepted QC requires zero rejected quantity`);
    }
    if (lineDraft.qcStatus === 'partial'
      && (accepted <= 0 || rejected <= 0 || !lineDraft.qcNotes.trim())) {
      throw new Error(`${label} partial QC requires accepted and rejected quantities plus notes`);
    }
    if (!lineDraft.manufacturerBatchNumber.trim()) {
      throw new Error(`${label} manufacturer batch number is required`);
    }
    if (!lineDraft.expiresOn) throw new Error(`${label} expiry date is required`);
    const receiptDate = receivedAt.toISOString().slice(0, 10);
    if (lineDraft.expiresOn <= receiptDate) {
      throw new Error(`${label} expiry must be after physical receipt`);
    }
    if (lineDraft.manufacturedOn && lineDraft.manufacturedOn > receiptDate) {
      throw new Error(`${label} manufacture date cannot follow physical receipt`);
    }
    if (mrp <= 0) throw new Error(`${label} MRP must be positive`);
    if (!source.mrp_conversions.some(item => item.id === lineDraft.mrpUomConversionId)) {
      throw new Error(`${label} MRP unit is not in the canonical purchase context`);
    }
    if (!source.eligible_locations.some(item => item.id === lineDraft.toLocationId)) {
      throw new Error(`${label} destination is not eligible for this product`);
    }

    return {
      purchase_order_line_id: source.purchase_order_line_id,
      batches: [{
        manufacturer_batch_number: lineDraft.manufacturerBatchNumber.trim(),
        ...(lineDraft.manufacturedOn ? { manufactured_on: lineDraft.manufacturedOn } : {}),
        expires_on: lineDraft.expiresOn,
        mrp: lineDraft.mrp.trim(),
        mrp_uom_conversion_id: lineDraft.mrpUomConversionId,
        received_quantity: lineDraft.receivedQuantity.trim(),
        accepted_quantity: lineDraft.acceptedQuantity.trim(),
        rejected_quantity: lineDraft.rejectedQuantity.trim(),
        free_quantity: lineDraft.freeQuantity.trim(),
        qc_status: lineDraft.qcStatus,
        ...(lineDraft.qcNotes.trim() ? { qc_notes: lineDraft.qcNotes.trim() } : {}),
        to_location_id: lineDraft.toLocationId,
      }],
    };
  });

  return {
    idempotency_key: draft.idempotencyKey,
    branch_id: context.branch_id,
    received_at: receivedAt.toISOString(),
    purchase_order_id: context.purchase_order_id,
    supplier_account_id: context.supplier_account_id,
    ...(challanNumber ? {
      supplier_challan_number: challanNumber,
      supplier_challan_date: challanDate,
    } : {}),
    lines,
  };
}
