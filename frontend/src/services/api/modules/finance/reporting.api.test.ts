import { apiHelpers } from '../../apiClient';
import { reportingApi } from './reporting.api';

jest.mock('../../apiClient', () => ({ apiHelpers: { get: jest.fn() } }));

test.each([
  ['getTrialBalance', '/canonical/reports/trial-balance'],
  ['getProfitLoss', '/canonical/reports/profit-loss'],
  ['getCustomerActivity', '/canonical/reports/customer-activity'],
] as const)('%s uses the exact canonical report route', async (method, route) => {
  const response = { data: {} };
  (apiHelpers.get as jest.Mock).mockResolvedValueOnce(response);
  const params = { date_from: '2026-08-01', date_to: '2026-08-31' };
  await expect(reportingApi[method](params)).resolves.toBe(response);
  expect(apiHelpers.get).toHaveBeenCalledWith(route, {
    params, preserveExactDecimals: true,
  });
});
