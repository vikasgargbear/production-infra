import React from 'react';

import CanonicalReportUnavailable from './CanonicalReportUnavailable';

interface LedgerReportsProps {
  embedded?: boolean;
  onClose?: () => void;
}

const LedgerAnalytics: React.FC<LedgerReportsProps> = () => (
  <CanonicalReportUnavailable
    title="Ledger analytics"
    reason="The canonical API publishes party statements and aging, but not a reviewed cross-ledger analytics projection."
    missingFacts={[
      'authoritative cash-flow and collection report series',
      'versioned party-performance and efficiency definitions',
      'server-generated report export resources',
    ]}
  />
);

export default LedgerAnalytics;
