import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileCheck2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';

import { ModuleHeader } from '../../global';
import {
  approveAndExecuteCanonicalAction,
  prepareCanonicalAction,
  type CanonicalCommandPreview,
} from '../../../services/api/canonicalOperatorActions';
import {
  canonicalSupplierInvoicesApi,
  type CanonicalEligibleReceipt,
  type CanonicalPostedSupplierInvoice,
  type CanonicalSupplierInvoiceContext,
} from '../../../services/api/modules/purchase/canonicalSupplierInvoices.api';
import { canonicalBusinessContextApi } from '../../../services/api/modules/org/canonicalBusinessContext.api';
import { clientUuid } from '../../../utils/clientUuid';
import {
  buildCanonicalSupplierInvoicePreparePayload,
  validateCanonicalSupplierInvoicePreview,
} from './utils/canonicalSupplierInvoiceCommand';
import { reconcileCanonicalSupplierInvoice } from './utils/canonicalSupplierInvoiceLifecycle';

const errorMessage = (error: any): string => (
  error?.response?.data?.detail?.message
  || error?.response?.data?.detail
  || error?.message
  || 'Canonical supplier-invoice operation failed.'
);

const CanonicalSupplierInvoiceFlow: React.FC<{ onClose?: () => void }> = ({ onClose }) => {
  const [receipts, setReceipts] = useState<CanonicalEligibleReceipt[]>([]);
  const [selectedReceiptId, setSelectedReceiptId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [businessDateLoading, setBusinessDateLoading] = useState(true);
  const [businessDateError, setBusinessDateError] = useState('');
  const [context, setContext] = useState<CanonicalSupplierInvoiceContext | null>(null);
  const [rates, setRates] = useState<Record<string, string>>({});
  const [itcAttested, setItcAttested] = useState(false);
  const [prepared, setPrepared] = useState<CanonicalCommandPreview | null>(null);
  const [posted, setPosted] = useState<CanonicalPostedSupplierInvoice | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const executedResourceId = useRef<string | null>(null);
  const prepareId = useRef(clientUuid());
  const lifecycleId = useRef(clientUuid());

  const selectedReceipt = useMemo(
    () => receipts.find((receipt) => receipt.goods_receipt_id === selectedReceiptId),
    [receipts, selectedReceiptId],
  );

  const loadReceipts = useCallback(async () => {
    setLoadingReceipts(true);
    try {
      const response = await canonicalSupplierInvoicesApi.eligibleReceipts();
      setReceipts(response.data.receipts);
    } catch (error) {
      setReceipts([]);
      toast.error(errorMessage(error));
    } finally {
      setLoadingReceipts(false);
    }
  }, []);

  useEffect(() => { void loadReceipts(); }, [loadReceipts]);

  useEffect(() => {
    let active = true;
    setBusinessDateLoading(true);
    void canonicalBusinessContextApi.get().then((businessContext) => {
      if (!active) return;
      setInvoiceDate((current) => current || businessContext.business_date);
      setReceivedDate((current) => current || businessContext.business_date);
      setBusinessDateError('');
    }).catch((error) => {
      if (!active) return;
      const message = errorMessage(error) || 'Unable to load the organization business date.';
      setBusinessDateError(message);
      toast.error(message);
    }).finally(() => {
      if (active) setBusinessDateLoading(false);
    });
    return () => { active = false; };
  }, []);

  const resetReview = () => {
    setPrepared(null);
    setPosted(null);
    executedResourceId.current = null;
    prepareId.current = clientUuid();
    lifecycleId.current = clientUuid();
  };

  const loadContext = async () => {
    if (!selectedReceiptId || !invoiceNumber.trim() || !invoiceDate || !receivedDate) {
      toast.error('Select a posted GRN and enter the exact supplier invoice and received dates.');
      return;
    }
    setLoading(true);
    resetReview();
    try {
      const response = await canonicalSupplierInvoicesApi.context({
        goodsReceiptId: selectedReceiptId,
        supplierInvoiceNumber: invoiceNumber.trim(),
        invoiceDate,
      });
      setContext(response.data);
      setRates(Object.fromEntries(response.data.lines.map((line) => [
        line.goods_receipt_line_id,
        line.suggested_quoted_unit_rate,
      ])));
      if (!response.data.ready) toast.error(response.data.blocking_reasons[0]);
    } catch (error) {
      setContext(null);
      setRates({});
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const draftPayload = () => {
    if (!context) throw new Error('Load canonical GRN and GSTR-2B context first.');
    return buildCanonicalSupplierInvoicePreparePayload(context, {
      idempotencyKey: `erp-web-supplier-invoice:${prepareId.current}`,
      supplierInvoiceNumber: invoiceNumber,
      invoiceDate,
      receivedDate,
      itcBusinessUseAttested: itcAttested,
      lines: context.lines.map((line) => ({
        goodsReceiptLineId: line.goods_receipt_line_id,
        quotedUnitRate: rates[line.goods_receipt_line_id] || '',
      })),
    });
  };

  const prepareReview = async () => {
    setLoading(true);
    try {
      const response = await prepareCanonicalAction(
        'procurement.supplier_invoice.prepare',
        draftPayload(),
      );
      if (!context) throw new Error('Canonical context expired before preview validation.');
      setPrepared(validateCanonicalSupplierInvoicePreview(response.data, context));
      toast.success('Immutable supplier-invoice preview is ready for approval.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const approveAndPost = async () => {
    if (!prepared) return;
    setLoading(true);
    try {
      const result = await reconcileCanonicalSupplierInvoice(
        prepared,
        lifecycleId.current,
        executedResourceId.current,
        async (preview, stableLifecycleId) => (
          await approveAndExecuteCanonicalAction(
            'procurement.supplier_invoice.prepare',
            preview,
            stableLifecycleId,
          )
        ).executed.data,
        async (resourceId) => (await canonicalSupplierInvoicesApi.detail(resourceId)).data,
        (resourceId) => { executedResourceId.current = resourceId; },
      );
      setPosted(result.detail);
      toast.success(`Supplier invoice ${result.detail.supplier_invoice_number} posted and reconciled.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  if (posted) {
    return (
      <div className="h-full overflow-y-auto bg-slate-50">
        <ModuleHeader title="Supplier Invoice Posted" documentNumber={posted.supplier_invoice_number} status="active" icon={CheckCircle2} iconColor="text-emerald-600" onClose={onClose || (() => {})} showSaveDraft={false} onSaveDraft={() => {}} />
        <main className="mx-auto max-w-5xl space-y-4 p-6">
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900">Server-confirmed accounting result</h2>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
              <div><p className="text-slate-500">Payable</p><p className="font-semibold">₹{posted.open_item_principal}</p></div>
              <div><p className="text-slate-500">Grand total</p><p className="font-semibold">₹{posted.grand_total}</p></div>
              <div><p className="text-slate-500">Journal</p><p className="font-semibold">{posted.journal_number}</p></div>
              <div><p className="text-slate-500">Inventory delta</p><p className="font-semibold">₹{posted.supplier_invoice_inventory_value_delta}</p></div>
            </div>
            <p className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              Receipt stock was already capitalized. This invoice created no second stock movement; GRN allocations, ITC, payable, and the balanced journal reconcile to the posted detail.
            </p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <ModuleHeader title="Supplier Invoice" documentNumber={invoiceNumber} status={prepared ? 'review' : 'active'} icon={FileCheck2} iconColor="text-blue-600" onClose={onClose || (() => {})} showSaveDraft={false} onSaveDraft={() => {}} additionalActions={[{ label: '', title: 'Refresh posted receipts', icon: RefreshCw, variant: 'ghost', onClick: loadReceipts, disabled: loadingReceipts } as any]} />
      <main className="mx-auto max-w-6xl space-y-4 p-6">
        {!prepared ? (
          <>
            <section className="rounded-lg border border-slate-200 bg-white p-5">
              <h2 className="font-semibold text-slate-900">1. Match a posted receipt to supplier tax evidence</h2>
              <p className="mt-1 text-sm text-slate-600">
                Required: select a posted GRN and enter the exact supplier invoice number, invoice date, and received date.
              </p>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <label className="text-sm md:col-span-2">Posted GRN
                  <select value={selectedReceiptId} onChange={(event) => { setSelectedReceiptId(event.target.value); setContext(null); resetReview(); }} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3">
                    <option value="">Select receipt</option>
                    {receipts.map((receipt) => <option key={receipt.goods_receipt_id} value={receipt.goods_receipt_id}>{receipt.goods_receipt_number} · {receipt.supplier_name} · ₹{receipt.remaining_capitalized_value}</option>)}
                  </select>
                </label>
                <label className="text-sm">Supplier invoice number
                  <input value={invoiceNumber} onChange={(event) => { setInvoiceNumber(event.target.value); setContext(null); resetReview(); }} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3" maxLength={64} />
                </label>
                <label className="text-sm">Invoice date
                  <input aria-label="Supplier invoice date" type="date" value={invoiceDate} onChange={(event) => { setInvoiceDate(event.target.value); setContext(null); resetReview(); }} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3" />
                </label>
                <label className="text-sm">Received date
                  <input aria-label="Supplier invoice received date" type="date" value={receivedDate} min={invoiceDate} onChange={(event) => { setReceivedDate(event.target.value); resetReview(); }} className="mt-1 min-h-11 w-full rounded-md border border-slate-300 px-3" />
                </label>
              </div>
              {businessDateLoading && <p className="mt-3 text-sm text-slate-600">Loading organization business date…</p>}
              {businessDateError && <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">{businessDateError} Enter both dates explicitly before continuing.</p>}
              {selectedReceipt && <p className="mt-3 text-xs text-slate-500">PO {selectedReceipt.purchase_order_number}; {selectedReceipt.remaining_line_count} unallocated line(s). The backend requires one exact parsed GSTR-2B match.</p>}
              <button type="button" onClick={loadContext} disabled={loading || businessDateLoading || !selectedReceiptId || !invoiceNumber.trim() || !invoiceDate || !receivedDate} className="mt-4 inline-flex min-h-11 items-center rounded-md bg-blue-600 px-4 font-medium text-white disabled:bg-slate-300">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Load canonical evidence</button>
            </section>

            {context && (
              <section className="rounded-lg border border-slate-200 bg-white p-5">
                <h2 className="font-semibold text-slate-900">2. Verify exact quantities, values, and ITC basis</h2>
                {context.blocking_reasons.map((reason) => <p key={reason} className="mt-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{reason}</p>)}
                {context.ready && (
                  <>
                    <div className="mt-4 overflow-x-auto rounded border border-slate-200">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-left text-slate-600"><tr><th className="p-3">Product</th><th className="p-3">Billed / Free</th><th className="p-3">Receipt value</th><th className="p-3">Quoted rate</th></tr></thead>
                        <tbody>{context.lines.map((line) => <tr key={line.goods_receipt_line_id} className="border-t border-slate-200"><td className="p-3"><p className="font-medium">{line.product_name}</p><p className="text-xs text-slate-500">{line.sku} · HSN {line.hsn_code} · {line.uom_code}</p></td><td className="p-3 font-mono">{line.remaining_billed_quantity} / {line.remaining_free_quantity}</td><td className="p-3 font-mono">₹{line.remaining_capitalized_value}</td><td className="p-3"><input aria-label={`Quoted rate for ${line.product_name}`} value={rates[line.goods_receipt_line_id] || ''} onChange={(event) => { setRates((current) => ({ ...current, [line.goods_receipt_line_id]: event.target.value })); resetReview(); }} inputMode="decimal" className="min-h-11 w-36 rounded border border-slate-300 px-3 font-mono" /></td></tr>)}</tbody>
                      </table>
                    </div>
                    <div className="mt-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">GSTR-2B: taxable ₹{context.portal_evidence?.taxable_amount}; CGST ₹{context.portal_evidence?.cgst_amount}; SGST ₹{context.portal_evidence?.sgst_amount}; IGST ₹{context.portal_evidence?.igst_amount}.</div>
                    {context.expense_charge_lines.length > 0 && <div className="mt-3 rounded border border-slate-200 p-3 text-sm text-slate-700">Reviewed PO charges: {context.expense_charge_lines.map((line) => `${line.expense_charge_code} ₹${line.quoted_amount} → ${line.account_code}`).join(', ')}</div>}
                    <label className="mt-4 flex min-h-11 items-start gap-3 rounded border border-slate-200 p-3 text-sm"><input type="checkbox" checked={itcAttested} onChange={(event) => { setItcAttested(event.target.checked); resetReview(); }} className="mt-1 h-5 w-5" /><span>I confirm taxable resale business use and that no Section 17 blocked-credit condition applies to these goods.</span></label>
                    <button type="button" onClick={prepareReview} disabled={loading || !itcAttested} className="mt-4 inline-flex min-h-11 items-center rounded-md bg-blue-600 px-4 font-medium text-white disabled:bg-slate-300">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Review server calculation</button>
                  </>
                )}
              </section>
            )}
          </>
        ) : (
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <button type="button" onClick={() => setPrepared(null)} disabled={Boolean(executedResourceId.current)} className="inline-flex min-h-11 items-center text-sm text-slate-700 disabled:text-slate-300"><ArrowLeft className="mr-2 h-4 w-4" />Back to evidence</button>
            <h2 className="mt-3 text-lg font-semibold">Immutable backend preview</h2>
            <p aria-label="Canonical command ID" className="mt-1 break-all font-mono text-xs text-slate-600">Command: {prepared.command_request_id}</p>
            <p className="mt-1 break-all text-xs text-slate-500">{prepared.preview_hash}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded border border-slate-200 p-3"><p className="text-xs text-slate-500">Financial impact</p><pre className="mt-2 whitespace-pre-wrap text-xs">{JSON.stringify(prepared.financial_impact, null, 2)}</pre></div>
              <div className="rounded border border-slate-200 p-3"><p className="text-xs text-slate-500">Tax / ITC impact</p><pre className="mt-2 whitespace-pre-wrap text-xs">{JSON.stringify(prepared.tax_impact, null, 2)}</pre></div>
              <div className="rounded border border-slate-200 p-3"><p className="text-xs text-slate-500">Inventory impact</p><pre className="mt-2 whitespace-pre-wrap text-xs">{JSON.stringify(prepared.inventory_impact, null, 2)}</pre></div>
            </div>
            <button type="button" onClick={approveAndPost} disabled={loading} className="mt-5 inline-flex min-h-11 items-center rounded-md bg-emerald-600 px-5 font-semibold text-white disabled:bg-slate-300">{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{executedResourceId.current ? 'Reconcile posted invoice' : 'Approve and post supplier invoice'}</button>
          </section>
        )}
      </main>
    </div>
  );
};

export default CanonicalSupplierInvoiceFlow;
