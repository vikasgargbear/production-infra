import type { AxiosResponse } from 'axios';

import { apiHelpers } from '../../apiClient';

export interface CanonicalReportPeriod {
  date_from: string;
  date_to: string;
}

export const reportingApi = {
  getTrialBalance: (params: CanonicalReportPeriod): Promise<AxiosResponse<unknown>> => (
    apiHelpers.get('/canonical/reports/trial-balance', {
      params, preserveExactDecimals: true,
    })
  ),
  getProfitLoss: (params: CanonicalReportPeriod): Promise<AxiosResponse<unknown>> => (
    apiHelpers.get('/canonical/reports/profit-loss', {
      params, preserveExactDecimals: true,
    })
  ),
  getCustomerActivity: (params: CanonicalReportPeriod): Promise<AxiosResponse<unknown>> => (
    apiHelpers.get('/canonical/reports/customer-activity', {
      params, preserveExactDecimals: true,
    })
  ),
};

export default reportingApi;
