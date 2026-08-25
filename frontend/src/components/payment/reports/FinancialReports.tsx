import React, { useEffect } from 'react';

import CanonicalReportUnavailable from '../../reports/CanonicalReportUnavailable';

interface FinancialReportsProps {
  onClose?: () => void;
}

const FinancialReports: React.FC<FinancialReportsProps> = ({ onClose }) => {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape'
        && !event.defaultPrevented
        && !document.querySelector('[role="dialog"][aria-modal="true"]')
      ) {
        onClose?.();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="h-full overflow-y-auto bg-blue-50 px-6 py-6">
      <CanonicalReportUnavailable
        title="Financial statements"
        reason="Trial balance, profit and loss, and balance sheet are unavailable until the canonical API publishes reviewed accounting-statement projections."
        missingFacts={[
          'versioned account-classification and closing-balance rules',
          'authoritative reporting-period and comparative-period facts',
          'server-generated statement and export resources',
        ]}
      />
      <p className="mt-4 text-center text-xs text-slate-500">
        Keyboard shortcut: <strong>Esc</strong> - Close
      </p>
    </div>
  );
};

export default FinancialReports;
