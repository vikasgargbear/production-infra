import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  PackageCheck,
  ShoppingBag,
} from 'lucide-react';

import { ModuleHeader } from '../../global';

type PurchaseWorkflowDestination = 'purchase-history' | 'grn' | 'supplier-invoice';

interface CanonicalPurchaseWorkflowProps {
  onClose?: () => void;
  onNavigate: (destination: PurchaseWorkflowDestination) => void;
}

const stepClass = 'rounded-xl border border-slate-200 bg-white p-5';
const primaryActionClass = 'mt-4 inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
const secondaryActionClass = 'inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';

/**
 * Purchase posting deliberately uses two independently reviewed canonical
 * transactions. A goods receipt owns stock evidence. A later supplier invoice
 * owns payable, GST/ITC, and journal evidence. Combining them in the browser
 * would hide a partial failure and would require inventing identities that are
 * only known after the receipt is posted.
 */
const CanonicalPurchaseWorkflow: React.FC<CanonicalPurchaseWorkflowProps> = ({
  onClose,
  onNavigate,
}) => (
  <div className="h-full overflow-y-auto bg-slate-50">
    <ModuleHeader
      title="Purchase Workflow"
      documentNumber=""
      status="active"
      icon={ShoppingBag}
      iconColor="text-blue-600"
      onClose={onClose || (() => {})}
      showSaveDraft={false}
      onSaveDraft={() => {}}
    />

    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <section className="rounded-xl border border-blue-200 bg-blue-50 p-5">
        <h1 className="text-xl font-semibold text-slate-900">Receive stock, then post the supplier invoice</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
          These are two server-reviewed operations because physical receipt and supplier tax evidence can arrive at different times. Each step has its own preview, approval, execution, and exact readback.
        </p>
      </section>

      <ol className="grid gap-5 lg:grid-cols-2">
        <li className={stepClass}>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">1</span>
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-slate-900"><PackageCheck className="h-5 w-5 text-blue-600" />Post goods receipt</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Open an approved or partially received purchase order and choose Receipt. Enter the physical receipt time, accepted/rejected quantities, exact batch, expiry, MRP conversion, QC result, and canonical location.
              </p>
              <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Result: stock and valuation only. No payable, GST/ITC, or finance journal is created in this step.
              </p>
              <button type="button" onClick={() => onNavigate('purchase-history')} className={primaryActionClass}>
                Find approved purchase order <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </div>
          </div>
        </li>

        <li className={stepClass}>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700">2</span>
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-slate-900"><FileCheck2 className="h-5 w-5 text-blue-600" />Post supplier invoice</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Match a posted receipt to the exact supplier invoice and parsed GSTR-2B evidence. Verify received quantities, quoted rates, expense allocation, tax registration, and ITC attestation before approval.
              </p>
              <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
                Result: supplier payable, GST/ITC, receipt allocations, and balanced journal. It must not create a second stock movement.
              </p>
              <button type="button" onClick={() => onNavigate('supplier-invoice')} className={primaryActionClass}>
                Match supplier invoice <ArrowRight className="ml-2 h-4 w-4" />
              </button>
            </div>
          </div>
        </li>
      </ol>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <div>
            <h2 className="font-semibold text-slate-900">Already received the goods?</h2>
            <p className="mt-1 text-sm text-slate-600">Review the posted receipt and its batch, location, stock-ledger, and valuation evidence.</p>
          </div>
        </div>
        <button type="button" onClick={() => onNavigate('grn')} className={secondaryActionClass}>
          <ClipboardList className="mr-2 h-4 w-4" />View goods receipts
        </button>
      </section>
    </main>
  </div>
);

export default CanonicalPurchaseWorkflow;
