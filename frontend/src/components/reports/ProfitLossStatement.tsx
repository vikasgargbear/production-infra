import React from 'react';

import CanonicalReportUnavailable from './CanonicalReportUnavailable';

const ProfitLossStatement: React.FC = () => (
  <CanonicalReportUnavailable
    title="Profit & loss statement"
    reason="A reviewed financial-statement mapping from posted ledger accounts to statutory P&L sections is not published."
    missingFacts={[
      'versioned account-to-statement classification rules',
      'authoritative gross profit, operating profit, EBITDA, and tax sections',
      'equal-period comparison and margin projections',
    ]}
  />
);

export default ProfitLossStatement;
