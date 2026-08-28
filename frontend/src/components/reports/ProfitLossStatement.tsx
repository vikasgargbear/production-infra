import React from 'react';

import FinancialReport from './FinancialReport';

const ProfitLossStatement: React.FC = () => (
  <FinancialReport
    title="Factual profit & loss"
    showTrialBalance={false}
  />
);

export default ProfitLossStatement;
