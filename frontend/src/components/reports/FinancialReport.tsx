import React from 'react';

import CanonicalReportUnavailable from './CanonicalReportUnavailable';

const FinancialReport: React.FC = () => (
  <CanonicalReportUnavailable
    title="Financial analytics"
    reason="The canonical API does not publish a reviewed management-financial reporting projection."
    missingFacts={[
      'versioned revenue, gross-profit, operating-profit, and net-profit definitions',
      'effective-dated receivable and payable comparison snapshots',
      'authoritative cash-flow, expense-breakdown, and transaction classifications',
    ]}
  />
);

export default FinancialReport;
