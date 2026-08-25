import React from 'react';

import CanonicalReportUnavailable from './CanonicalReportUnavailable';

const ProductAnalytics: React.FC = () => (
  <CanonicalReportUnavailable
    title="Product analytics"
    reason="The canonical API does not publish a reviewed product profitability or movement policy."
    missingFacts={[
      'posted revenue matched to authoritative cost layers',
      'versioned margin, velocity, and low-stock classifications',
      'equal-period product trend and turnover projections',
    ]}
  />
);

export default ProductAnalytics;
