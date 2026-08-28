import React from 'react';

import FinancialReport from './FinancialReport';

interface LedgerReportsProps {
  embedded?: boolean;
  onClose?: () => void;
}

const LedgerAnalytics: React.FC<LedgerReportsProps> = () => (
  <FinancialReport
    title="Ledger trial balance"
    showProfitLoss={false}
  />
);

export default LedgerAnalytics;
