import { isCanonicalUuid } from '../../../utils/canonicalUuid';

type ReturnRecord = Record<string, any>;
type GstTreatment = 'commercial_only' | 'statutory';

const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]{0,13})(?:\.([0-9]{1,6}))?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

const SALES_REASON_CODES: Record<string, string> = {
  DAMAGED: 'damage',
  EXPIRED: 'expiry',
  QUALITY_ISSUE: 'quality',
  WRONG_PRODUCT: 'wrong_supply',
  CUSTOMER_REJECTION: 'customer_rejection',
  RECALL: 'recall',
};

const PURCHASE_REASON_CODES: Record<string, string> = {
  EXCESS_QUANTITY: 'excess_supply',
  WRONG_PRODUCT: 'wrong_supply',
};

export function canonicalDecimal(value: unknown, label: string): string {
  const text = String(value ?? '').trim();
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) throw new Error(`${label} must be a nonnegative decimal string with at most six places.`);
  const [whole, fraction = ''] = text.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFraction = fraction.replace(/0+$/, '');
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}

function decimalUnits(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

function decimalPositive(value: string): boolean {
  return decimalUnits(value) > 0n;
}

function decimalLte(left: string, right: string): boolean {
  return decimalUnits(left) <= decimalUnits(right);
}

function requiredUuid(value: unknown, label: string): string {
  const normalized = String(value ?? '').trim();
  if (!isCanonicalUuid(normalized)) throw new Error(`${label} is missing its canonical UUID.`);
  return normalized;
}

function requiredDate(value: unknown, label: string): string {
  const date = String(value ?? '').trim();
  if (!DATE_PATTERN.test(date)) throw new Error(`${label} must be YYYY-MM-DD.`);
  return date;
}

function idempotencyKey(value: string, label: string): string {
  const key = value.trim();
  if (!KEY_PATTERN.test(key)) throw new Error(`${label} requires an explicit durable idempotency key.`);
  return key;
}

function reasonCode(value: unknown, mapping: Record<string, string>, label: string): string {
  const mapped = mapping[String(value ?? '').trim().toUpperCase()];
  if (!mapped) throw new Error(`${label} is outside the reviewed canonical return scope.`);
  return mapped;
}

function gstTreatment(value: unknown, supported: unknown, label: string): GstTreatment {
  const selected = String(value ?? '') as GstTreatment;
  if (!['commercial_only', 'statutory'].includes(selected)) {
    throw new Error(`${label} requires an explicit GST treatment.`);
  }
  if (!Array.isArray(supported) || !supported.includes(selected)) {
    throw new Error(`${label} ${selected} lacks the required canonical evidence.`);
  }
  return selected;
}

function selectedLines(data: ReturnRecord): ReturnRecord[] {
  const lines = (data.items || []).filter((item: ReturnRecord) => {
    if (item.selected === false) return false;
    try {
      return decimalPositive(canonicalDecimal(item.return_paid_qty, 'billed quantity'))
        || decimalPositive(canonicalDecimal(item.return_free_qty, 'free quantity'));
    } catch {
      return false;
    }
  });
  if (!lines.length) throw new Error('At least one positive canonical return line is required.');
  return lines;
}

function quantities(item: ReturnRecord, label: string) {
  if (item.return_paid_qty == null || item.return_free_qty == null) {
    throw new Error(`${label} requires separate billed and free quantities.`);
  }
  const billed = canonicalDecimal(item.return_paid_qty, `${label}.billed_quantity`);
  const free = canonicalDecimal(item.return_free_qty, `${label}.free_quantity`);
  if (!decimalPositive(billed) && !decimalPositive(free)) {
    throw new Error(`${label} billed plus free quantity must be positive.`);
  }
  const maxBilled = canonicalDecimal(item.returnable_billed_quantity, `${label}.returnable_billed_quantity`);
  const maxFree = canonicalDecimal(item.returnable_free_quantity, `${label}.returnable_free_quantity`);
  if (!decimalLte(billed, maxBilled) || !decimalLte(free, maxFree)) {
    throw new Error(`${label} exceeds its authoritative billed/free remainder.`);
  }
  return { billed, free };
}

export function buildSalesReturnPreparePayload(data: ReturnRecord, durableKey: string) {
  const treatment = gstTreatment(
    data.gst_tax_treatment,
    data.supported_gst_treatments,
    'Sales return',
  );
  const seen = new Set<string>();
  const payload: Record<string, unknown> = {
    idempotency_key: idempotencyKey(durableKey, 'Sales return prepare'),
    branch_id: requiredUuid(data.branch_id, 'Sales return branch'),
    return_date: requiredDate(data.return_date, 'Sales return date'),
    original_invoice_id: requiredUuid(data.invoice_id, 'Original sales invoice'),
    reason_code: reasonCode(data.return_reason, SALES_REASON_CODES, 'Sales return reason'),
    gst_tax_treatment: treatment,
    lines: selectedLines(data).map((item, index) => {
      const label = `Sales return lines[${index}]`;
      const lineId = requiredUuid(item.original_invoice_line_id, `${label}.original_invoice_line_id`);
      if (seen.has(lineId)) throw new Error('One return command cannot repeat an original invoice line.');
      seen.add(lineId);
      const { billed, free } = quantities(item, label);
      const condition = String(item.return_condition ?? '');
      if (!['sealed_resaleable', 'opened', 'damaged', 'expired', 'recalled', 'quality_hold'].includes(condition)) {
        throw new Error(`${label}.return_condition is not canonical.`);
      }
      const batchId = requiredUuid(item.batch_id, `${label}.batch_id`);
      return {
        original_invoice_line_id: lineId,
        invoice_dispatch_allocation_id: requiredUuid(
          item.invoice_dispatch_allocation_id,
          `${label}.invoice_dispatch_allocation_id`,
        ),
        billed_quantity: billed,
        free_quantity: free,
        batch_allocation: { batch_id: batchId, billed_quantity: billed, free_quantity: free },
        to_location_id: requiredUuid(item.to_location_id, `${label}.quarantine_location`),
        return_condition: condition,
      };
    }),
  };
  if (treatment === 'statutory') {
    payload.recipient_itc_reversal_evidence_attachment_id = requiredUuid(
      data.recipient_itc_reversal_evidence_attachment_id,
      'Recipient ITC-reversal evidence',
    );
    const confirmedAt = String(data.recipient_itc_reversal_confirmed_at ?? '');
    if (!confirmedAt || Number.isNaN(Date.parse(confirmedAt))) {
      throw new Error('Recipient ITC-reversal confirmation time is required.');
    }
    payload.recipient_itc_reversal_confirmed_at = confirmedAt;
  }
  return payload;
}

export function buildPurchaseReturnPreparePayload(data: ReturnRecord, durableKey: string) {
  const treatment = gstTreatment(
    data.gst_tax_treatment,
    data.supported_gst_treatments,
    'Purchase return',
  );
  const transport = data.transport_details || {};
  const mode = String(transport.transport_mode ?? '');
  if (!['road', 'rail', 'air', 'ship', 'multimodal', 'in_person'].includes(mode)) {
    throw new Error('Purchase return transport mode is not canonical.');
  }
  const logistics: Record<string, unknown> = {
    transport_mode: mode,
    distance_km: canonicalDecimal(transport.distance_km, 'Purchase return distance'),
  };
  if (mode === 'road') {
    const vehicle = String(transport.vehicle_number ?? '').trim();
    if (!vehicle || !['regular', 'over_dimensional_cargo'].includes(transport.vehicle_type)) {
      throw new Error('Road return requires vehicle number and vehicle type.');
    }
    logistics.vehicle_number = vehicle;
    logistics.vehicle_type = transport.vehicle_type;
  } else if (transport.vehicle_number || transport.vehicle_type) {
    throw new Error('Non-road return must not include road vehicle fields.');
  }
  if (mode !== 'in_person') {
    logistics.transporter_party_id = requiredUuid(transport.transporter_party_id, 'Transporter party');
  }
  if (['rail', 'air', 'ship', 'multimodal'].includes(mode)) {
    const reference = String(transport.transport_document_number ?? '').trim();
    if (!reference) throw new Error('Selected transport mode requires a transport document number.');
    logistics.transport_document_number = reference;
    logistics.transport_document_date = requiredDate(
      transport.transport_document_date,
      'Transport document date',
    );
  } else if (transport.transport_document_number || transport.transport_document_date) {
    if (!transport.transport_document_number || !transport.transport_document_date) {
      throw new Error('Transport document number and date must be supplied together.');
    }
    logistics.transport_document_number = String(transport.transport_document_number).trim();
    logistics.transport_document_date = requiredDate(
      transport.transport_document_date,
      'Transport document date',
    );
  }

  const seenReceipt = new Set<string>();
  const seenInvoiceLine = new Set<string>();
  const payload: Record<string, unknown> = {
    idempotency_key: idempotencyKey(durableKey, 'Purchase return prepare'),
    branch_id: requiredUuid(data.branch_id, 'Purchase return branch'),
    return_date: requiredDate(data.return_date, 'Purchase return date'),
    return_source_kind: 'invoiced',
    original_supplier_invoice_id: requiredUuid(data.supplier_invoice_id, 'Original supplier invoice'),
    reason_code: reasonCode(data.return_reason, PURCHASE_REASON_CODES, 'Purchase return reason'),
    gst_tax_treatment: treatment,
    supplier_destination_address_id: requiredUuid(
      data.supplier_destination_address_id,
      'Supplier destination address',
    ),
    logistics,
    lines: selectedLines(data).map((item, index) => {
      const label = `Purchase return lines[${index}]`;
      const receiptLineId = requiredUuid(item.goods_receipt_line_id, `${label}.goods_receipt_line_id`);
      const invoiceLineId = requiredUuid(item.supplier_invoice_line_id, `${label}.supplier_invoice_line_id`);
      if (seenReceipt.has(receiptLineId) || seenInvoiceLine.has(invoiceLineId)) {
        throw new Error('One purchase return cannot repeat a receipt or supplier-invoice line.');
      }
      seenReceipt.add(receiptLineId);
      seenInvoiceLine.add(invoiceLineId);
      const { billed, free } = quantities(item, label);
      const batchId = requiredUuid(item.batch_id, `${label}.batch_id`);
      const conversion = canonicalDecimal(item.uom_conversion_factor, `${label}.uom_conversion_factor`);
      const availableStock = canonicalDecimal(item.stock_on_hand_base_quantity, `${label}.stock_on_hand_base_quantity`);
      if (
        (decimalUnits(billed) + decimalUnits(free)) * decimalUnits(conversion)
        > decimalUnits(availableStock) * 1_000_000n
      ) {
        throw new Error(`${label} exceeds authoritative stock at the original receipt location.`);
      }
      return {
        goods_receipt_line_id: receiptLineId,
        supplier_invoice_receipt_allocation_id: requiredUuid(
          item.supplier_invoice_receipt_allocation_id,
          `${label}.supplier_invoice_receipt_allocation_id`,
        ),
        billed_quantity: billed,
        free_quantity: free,
        batch_allocation: { batch_id: batchId, billed_quantity: billed, free_quantity: free },
        from_location_id: requiredUuid(item.from_location_id, `${label}.from_location_id`),
      };
    }),
  };
  if (treatment === 'statutory') {
    payload.supplier_credit_note_portal_line_id = requiredUuid(
      data.supplier_credit_note_portal_line_id,
      'Supplier GSTR-2B credit-note evidence',
    );
  }
  return payload;
}
