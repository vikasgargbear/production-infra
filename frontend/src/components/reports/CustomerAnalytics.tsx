import React from 'react';

import CanonicalReportUnavailable from './CanonicalReportUnavailable';

const CustomerAnalytics: React.FC = () => (
  <CanonicalReportUnavailable
    title="Customer analytics"
    reason="The canonical API does not publish a reviewed customer lifecycle or segmentation policy."
    missingFacts={[
      'versioned active, inactive, and churn classification rules',
      'authoritative customer lifetime-value and retention projections',
      'server-published acquisition and segment series for one exact period',
    ]}
  />
);

export default CustomerAnalytics;
