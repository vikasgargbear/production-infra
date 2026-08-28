import { apiHelpers } from '../../apiClient';
import { gstApi } from './gst.api';

jest.mock('../../apiClient', () => ({
  apiHelpers: { get: jest.fn(), post: jest.fn() },
}));

test('GSTR report requests match the canonical backend date schema', () => {
  gstApi.reports.gstr1({ date_from: '2026-08-01', date_to: '2026-08-31' });
  gstApi.reports.gstr3b({ date_from: '2026-07-01', date_to: '2026-07-31' });

  expect(apiHelpers.get).toHaveBeenNthCalledWith(1, '/gst/reports/gstr1', {
    params: { date_from: '2026-08-01', date_to: '2026-08-31' },
  });
  expect(apiHelpers.get).toHaveBeenNthCalledWith(2, '/gst/reports/gstr3b', {
    params: { date_from: '2026-07-01', date_to: '2026-07-31' },
  });
});
