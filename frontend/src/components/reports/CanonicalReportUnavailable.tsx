import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface CanonicalReportUnavailableProps {
  title: string;
  reason: string;
  missingFacts: string[];
}

const CanonicalReportUnavailable: React.FC<CanonicalReportUnavailableProps> = ({
  title,
  reason,
  missingFacts,
}) => (
  <main className="min-h-screen bg-gray-50 p-6">
    <section
      aria-labelledby="canonical-report-unavailable-title"
      className="mx-auto max-w-3xl rounded-lg border border-amber-200 bg-white p-6"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-2">
          <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden="true" />
        </div>
        <div>
          <h1 id="canonical-report-unavailable-title" className="text-xl font-semibold text-gray-950">
            {title} unavailable
          </h1>
          <p className="mt-2 text-sm leading-6 text-gray-700">{reason}</p>
        </div>
      </div>
      <div className="mt-5 border-t border-gray-200 pt-4">
        <h2 className="text-sm font-semibold text-gray-900">Required canonical facts</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
          {missingFacts.map(fact => <li key={fact}>{fact}</li>)}
        </ul>
      </div>
      <p className="mt-5 text-sm text-gray-600">
        No local document totals, thresholds, classifications, or zero placeholders are shown as a substitute.
      </p>
    </section>
  </main>
);

export default CanonicalReportUnavailable;
