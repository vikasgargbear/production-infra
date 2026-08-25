import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  PackageCheck,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { clientUuid } from '../../../utils/clientUuid';
import { canonicalExecutionCompleted } from '../../../services/api/canonicalOperatorActions';
import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import type { CanonicalReceiptContext } from '../../../services/api/modules/purchase/canonicalGoodsReceipts.api';
import {
  initialReceiptBatchDraft,
  initialReceiptDraft,
} from './canonicalReceiptCommand';
import type { CanonicalReceiptDraft } from './canonicalReceiptCommand';
import {
  postCanonicalGoodsReceipt,
  prepareCanonicalGoodsReceipt,
} from './canonicalReceiptLifecycle';


interface Props {
  context: CanonicalReceiptContext;
  onCancel: () => void;
  onPosted: (goodsReceiptId: string) => void;
}

function errorMessage(error: any): string {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  if (Array.isArray(detail)) return detail.map(item => item?.msg || String(item)).join('; ');
  return error?.message || 'Goods receipt request failed. No receipt was posted.';
}

const inputClass = 'mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200';

export const CanonicalGoodsReceiptForm: React.FC<Props> = ({
  context,
  onCancel,
  onPosted,
}) => {
  const [draft, setDraft] = useState<CanonicalReceiptDraft>(() => initialReceiptDraft(
    context,
    `erp-web-goods-receipt-prepare:${clientUuid()}`,
  ));
  const [lifecycleId] = useState(() => clientUuid());
  const [preview, setPreview] = useState<CanonicalCommandPreview | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unavailable = useMemo(() => context.lines.some(line => (
    !line.eligible_locations.length || !line.mrp_conversions.length
  )), [context.lines]);

  const updateLine = (index: number, patch: Record<string, unknown>) => {
    setPreview(null);
    setDraft(current => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => (
        lineIndex === index ? { ...line, ...patch } : line
      )),
    }));
  };

  const updateBatch = (
    lineIndex: number,
    batchIndex: number,
    patch: Record<string, unknown>,
  ) => {
    setPreview(null);
    setDraft(current => ({
      ...current,
      lines: current.lines.map((line, currentLineIndex) => (
        currentLineIndex === lineIndex
          ? {
            ...line,
            batches: line.batches.map((batch, currentBatchIndex) => (
              currentBatchIndex === batchIndex ? { ...batch, ...patch } : batch
            )),
          }
          : line
      )),
    }));
  };

  const addBatch = (lineIndex: number) => {
    setPreview(null);
    setDraft(current => ({
      ...current,
      lines: current.lines.map((line, currentLineIndex) => (
        currentLineIndex === lineIndex
          ? {
            ...line,
            batches: [
              ...line.batches,
              initialReceiptBatchDraft(context.lines[lineIndex]),
            ],
          }
          : line
      )),
    }));
  };

  const removeBatch = (lineIndex: number, batchIndex: number) => {
    setPreview(null);
    setDraft(current => ({
      ...current,
      lines: current.lines.map((line, currentLineIndex) => (
        currentLineIndex === lineIndex
          ? {
            ...line,
            batches: line.batches.filter((_batch, currentBatchIndex) => (
              currentBatchIndex !== batchIndex
            )),
          }
          : line
      )),
    }));
  };

  const prepare = async () => {
    setError(null);
    setPreparing(true);
    try {
      const response = await prepareCanonicalGoodsReceipt(context, draft);
      setPreview(response.data);
    } catch (requestError) {
      setPreview(null);
      setError(errorMessage(requestError));
    } finally {
      setPreparing(false);
    }
  };

  const post = async () => {
    if (!preview) return;
    setError(null);
    setPosting(true);
    try {
      const { executed } = await postCanonicalGoodsReceipt(preview, lifecycleId);
      if (!canonicalExecutionCompleted(executed.data) || !executed.data.resource_id) {
        throw new Error(
          `Execution returned ${executed.data.status || 'an unknown status'} without a receipt UUID. Check command status before retrying.`,
        );
      }
      onPosted(String(executed.data.resource_id));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 bg-white p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Canonical goods receipt</p>
            <h2 className="mt-1 text-xl font-semibold text-gray-900">{context.purchase_order_number}</h2>
            <p className="mt-1 text-sm text-gray-600">{context.supplier_name}</p>
            <p className="mt-2 break-all text-xs text-gray-500">PO UUID: {context.purchase_order_id}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            aria-label="Cancel goods receipt"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 rounded-xl border border-gray-200 bg-white p-5 sm:grid-cols-3">
          <label className="text-sm font-medium text-gray-700">
            Physical receipt time
            <input
              type="datetime-local"
              value={draft.receivedAt}
              onChange={event => {
                setPreview(null);
                setDraft(current => ({
                  ...current,
                  receivedAt: event.target.value,
                }));
              }}
              className={inputClass}
              required
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Supplier challan number
            <input
              value={draft.supplierChallanNumber}
              onChange={event => {
                setPreview(null);
                setDraft(current => ({ ...current, supplierChallanNumber: event.target.value }));
              }}
              className={inputClass}
              maxLength={64}
              placeholder="Optional, paired with date"
            />
          </label>
          <label className="text-sm font-medium text-gray-700">
            Supplier challan date
            <input
              type="date"
              value={draft.supplierChallanDate}
              onChange={event => {
                setPreview(null);
                setDraft(current => ({ ...current, supplierChallanDate: event.target.value }));
              }}
              className={inputClass}
            />
          </label>
        </div>

        <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
          Required: select at least one PO line and record physical receipt time, batch, expiry, quantities, MRP unit, destination, and QC disposition.
        </p>

        {context.lines.map((source, index) => {
          const line = draft.lines[index];
          return (
            <fieldset key={source.purchase_order_line_id} className="rounded-xl border border-gray-200 bg-white p-5">
              <legend className="px-2 text-sm font-semibold text-gray-900">
                Line {source.line_number}: {source.product_name}
              </legend>
              <label className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  data-testid={`receive-po-product-${source.product_id}`}
                  checked={line.included}
                  onChange={event => updateLine(index, { included: event.target.checked })}
                  className="h-5 w-5 rounded border-gray-300"
                />
                Receive this line ({source.remaining_billed_quantity} billed + {source.remaining_free_quantity} free {source.ordered_uom_code} remaining)
              </label>

              {line.included && (
                <div className="space-y-4">
                  {line.batches.map((batch, batchIndex) => (
                    <fieldset
                      key={`${source.purchase_order_line_id}:${batchIndex}`}
                      className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                    >
                      <legend className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                        Physical batch {batchIndex + 1}
                      </legend>
                      <div className="mb-2 flex justify-end">
                        <button
                          type="button"
                          onClick={() => removeBatch(index, batchIndex)}
                          disabled={line.batches.length === 1}
                          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Remove physical batch ${batchIndex + 1} from line ${source.line_number}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <label className="text-sm font-medium text-gray-700 lg:col-span-2">
                          Manufacturer batch number
                          <input value={batch.manufacturerBatchNumber} onChange={event => updateBatch(index, batchIndex, { manufacturerBatchNumber: event.target.value })} className={inputClass} maxLength={64} required />
                        </label>
                        <label className="text-sm font-medium text-gray-700">
                          Manufactured on
                          <input type="date" value={batch.manufacturedOn} onChange={event => updateBatch(index, batchIndex, { manufacturedOn: event.target.value })} className={inputClass} />
                        </label>
                        <label className="text-sm font-medium text-gray-700">
                          Expires on
                          <input type="date" value={batch.expiresOn} onChange={event => updateBatch(index, batchIndex, { expiresOn: event.target.value })} className={inputClass} required />
                        </label>
                        <label className="text-sm font-medium text-gray-700">
                          Received billed qty
                          <input inputMode="decimal" value={batch.receivedQuantity} onChange={event => updateBatch(index, batchIndex, { receivedQuantity: event.target.value })} className={inputClass} required />
                        </label>
                        <label className="text-sm font-medium text-gray-700">
                          Accepted billed qty
                          <input inputMode="decimal" value={batch.acceptedQuantity} onChange={event => updateBatch(index, batchIndex, { acceptedQuantity: event.target.value })} className={inputClass} required />
                        </label>
                        <label className="text-sm font-medium text-gray-700">
                          Rejected qty
                          <input inputMode="decimal" value={batch.rejectedQuantity} onChange={event => updateBatch(index, batchIndex, { rejectedQuantity: event.target.value })} className={inputClass} required />
                        </label>
                        <label className="text-sm font-medium text-gray-700">
                          Accepted free qty
                          <input inputMode="decimal" value={batch.freeQuantity} onChange={event => updateBatch(index, batchIndex, { freeQuantity: event.target.value })} className={inputClass} required />
                        </label>
                        <label className="text-sm font-medium text-gray-700">
                          MRP
                          <input inputMode="decimal" value={batch.mrp} onChange={event => updateBatch(index, batchIndex, { mrp: event.target.value })} className={inputClass} required />
                        </label>
                        <label className="text-sm font-medium text-gray-700">
                          MRP unit
                          <select value={batch.mrpUomConversionId} onChange={event => updateBatch(index, batchIndex, { mrpUomConversionId: event.target.value })} className={inputClass} required>
                            <option value="">Select MRP unit</option>
                            {source.mrp_conversions.map(conversion => (
                              <option key={conversion.id} value={conversion.id}>{conversion.from_uom_code} → {conversion.to_uom_code} × {conversion.multiplier}</option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm font-medium text-gray-700 lg:col-span-2">
                          Destination location
                          <select value={batch.toLocationId} onChange={event => updateBatch(index, batchIndex, { toLocationId: event.target.value })} className={inputClass} required>
                            <option value="">Select destination</option>
                            {source.eligible_locations.map(location => (
                              <option key={location.id} value={location.id}>{location.code} — {location.name} ({location.location_type})</option>
                            ))}
                          </select>
                        </label>
                        <label className="text-sm font-medium text-gray-700">
                          QC disposition
                          <select value={batch.qcStatus} onChange={event => updateBatch(index, batchIndex, { qcStatus: event.target.value })} className={inputClass}>
                            <option value="">Select QC disposition</option>
                            <option value="accepted">Accepted</option>
                            <option value="partial">Partially accepted</option>
                          </select>
                        </label>
                        <label className="text-sm font-medium text-gray-700 lg:col-span-3">
                          QC notes {batch.qcStatus === 'partial' ? '(required)' : '(optional)'}
                          <input value={batch.qcNotes} onChange={event => updateBatch(index, batchIndex, { qcNotes: event.target.value })} className={inputClass} maxLength={1024} />
                        </label>
                      </div>
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    onClick={() => addBatch(index)}
                    className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add another physical batch
                  </button>
                </div>
              )}
            </fieldset>
          );
        })}

        {unavailable && (
          <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertCircle className="h-5 w-5 shrink-0" />
            A selected PO line lacks an active eligible location or effective MRP UOM conversion. Receipt preparation is disabled until canonical master data is complete.
          </div>
        )}
        {error && (
          <div role="alert" className="flex gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
          <button type="button" onClick={onCancel} className="min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
          <button
            type="button"
            onClick={prepare}
            disabled={preparing || posting || unavailable}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {preparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Review stock impact
          </button>
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="receipt-confirm-title">
          <div data-testid="canonical-immutable-preview" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl sm:p-6">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-600" />
              <div>
                <h3 id="receipt-confirm-title" className="text-lg font-semibold text-gray-900">Approve this exact stock receipt?</h3>
                <p className="mt-1 text-sm text-gray-600">This posts canonical inventory. It creates no supplier payable, tax document, or journal entry.</p>
              </div>
            </div>
            <dl className="mt-5 grid gap-3 rounded-xl bg-gray-50 p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">Command UUID</dt><dd className="break-all font-medium text-gray-900">{preview.command_request_id}</dd></div>
              <div><dt className="text-gray-500">PO</dt><dd className="font-medium text-gray-900">{context.purchase_order_number}</dd></div>
              <div className="sm:col-span-2"><dt className="text-gray-500">Preview hash</dt><dd className="break-all font-mono text-xs text-gray-900">{preview.preview_hash}</dd></div>
            </dl>
            {Array.isArray(preview.inventory_impact) && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-semibold text-gray-900">Inventory impact</p>
                {(preview.inventory_impact as any[]).map((impact, index) => (
                  <div key={index} className="rounded-lg border border-gray-200 p-3 text-xs text-gray-700">
                    {String(impact.base_accepted_quantity)} accepted + {String(impact.base_free_quantity)} free base units · ₹{String(impact.extended_cost)} · {String(impact.location_id)}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button type="button" disabled={posting} onClick={() => setPreview(null)} className="min-h-11 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700">Back to edit</button>
              <button type="button" disabled={posting} onClick={post} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                {posting && <Loader2 className="h-4 w-4 animate-spin" />}
                Approve and post receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
