import React from 'react';
import { AlertCircle, ShoppingCart } from 'lucide-react';

/**
 * Purchase analytics require a canonical backend aggregate over posted supplier
 * invoices and returns. Until that read model exists, show an explicit boundary
 * instead of deriving financial totals from purchase orders or sample values.
 */
const PurchaseReport: React.FC = () => (
  <main className="min-h-full bg-gray-50 p-4 sm:p-6">
    <section className="mx-auto max-w-4xl rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50">
          <ShoppingCart className="h-5 w-5 text-blue-700" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Purchase Report</h1>
          <p className="mt-1 text-sm text-gray-600">Supplier invoice and procurement analytics</p>
        </div>
      </div>

      <div role="status" className="mt-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <h2 className="font-medium text-amber-900">Canonical purchase analytics are not available yet</h2>
          <p className="mt-1 text-sm text-amber-800">
            This report will remain unavailable until the backend exposes posted supplier-invoice,
            return, tax, and settlement aggregates. No sample or purchase-order values are shown.
          </p>
        </div>
      </div>
    </section>
  </main>
);

export default PurchaseReport;
