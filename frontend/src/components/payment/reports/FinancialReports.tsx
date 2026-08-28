import React, { useEffect } from 'react';

import FinancialReport from '../../reports/FinancialReport';

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
    <div className="h-full overflow-y-auto bg-blue-50">
      <FinancialReport title="Financial statements" />
      <p className="mt-4 text-center text-xs text-slate-500">
        Keyboard shortcut: <strong>Esc</strong> - Close
      </p>
    </div>
  );
};

export default FinancialReports;
