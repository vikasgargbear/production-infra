/**
 * Tax analytics needs posted-document, exact-decimal, equal-period API facts.
 * The legacy aggregate endpoints include non-posted documents and publish JSON
 * numbers, so this secondary surface must not present them as authoritative.
 */

import React from 'react';
import { AlertCircle, Receipt } from 'lucide-react';
import { ModuleHeader } from '../global';

interface TaxAnalyticsProps {
  embedded?: boolean;
  onClose?: () => void;
}

const TaxAnalytics: React.FC<TaxAnalyticsProps> = ({ embedded = false, onClose }) => (
  <div className={embedded ? 'p-6' : 'h-full bg-gray-50'}>
    {!embedded && (
      <ModuleHeader
        title="Tax Analytics"
        documentNumber=""
        status=""
        icon={Receipt}
        iconColor="text-orange-600"
        onClose={onClose}
        historyType="report"
      />
    )}
    <section
      aria-labelledby="tax-analytics-unavailable-title"
      className="m-6 rounded-lg border border-amber-200 bg-amber-50 p-5"
    >
      <div className="flex items-start gap-3">
        <AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div>
          <h2 id="tax-analytics-unavailable-title" className="font-semibold text-amber-950">
            Tax analytics unavailable
          </h2>
          <p className="mt-1 text-sm text-amber-900">
            The API does not yet publish exact posted-tax trends and equal-period comparisons.
            Draft document totals, floating-point calculations, and invented compliance statuses are not shown.
          </p>
        </div>
      </div>
    </section>
  </div>
);

export default TaxAnalytics;
