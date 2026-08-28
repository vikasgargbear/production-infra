import React from 'react';
import { AlertCircle, Package } from 'lucide-react';

/**
 * Stock Hub reads are deliberately branch-scoped. An organization-wide report
 * needs its own canonical projection so values, movements and branch access are
 * reconciled by the backend rather than guessed or combined in the browser.
 */
const InventoryReport: React.FC = () => (
  <main className="min-h-full bg-gray-50 p-4 sm:p-6">
    <section className="mx-auto max-w-4xl rounded-lg border border-gray-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-blue-50">
          <Package className="h-5 w-5 text-blue-700" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Inventory Analytics</h1>
          <p className="mt-1 text-sm text-gray-600">Organization-wide stock movement and valuation</p>
        </div>
      </div>

      <div role="status" className="mt-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <h2 className="font-medium text-amber-900">Canonical inventory analytics are not available yet</h2>
          <p className="mt-1 text-sm text-amber-800">
            An authoritative organization-wide inventory report projection is not published.
            Branch-scoped stock is available in Stock Management; this report will not combine,
            infer, or display legacy inventory values.
          </p>
        </div>
      </div>
    </section>
  </main>
);

export default InventoryReport;
