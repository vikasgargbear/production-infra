import { projectPaymentAnalytics } from './paymentAnalyticsProjection';

const list = {
  payments: [{
    id: '10000000-0000-7000-8000-000000000001',
    amount: 168,
    method: 'upi',
    status: 'posted',
    date: '2026-08-25',
    reference: 'RCPT-1',
    customer: null,
    type: 'received',
  }],
};

const summary = {
  total_received: 168,
  total_sent: 0,
  net_flow: 168,
  pending_payments: 0,
  completed_payments: 1,
  failed_payments: 0,
  avg_transaction_value: 168,
  method_breakdown: { upi: 168 },
  status_breakdown: { posted: 1 },
};

const trends = {
  monthly: { labels: ['2026-08'], received: [168], sent: [0] },
  daily: { labels: ['2026-08-25'], inflow: [168], outflow: [0] },
};

test('preserves explicit canonical zero facts and nullable party identity', () => {
  const projected = projectPaymentAnalytics(list, summary, trends);
  expect(projected.summary.totalSent).toBe(0);
  expect(projected.summary.pendingPayments).toBe(0);
  expect(projected.payments[0].customer).toBeNull();
  expect(projected.trends.sent).toEqual([0]);
});

test.each([
  ['missing amount', { ...list, payments: [{ ...list.payments[0], amount: undefined }] }, summary, trends],
  ['missing summary fact', list, { ...summary, total_sent: undefined }, trends],
  ['invented summary string', list, { ...summary, total_sent: '0' }, trends],
  ['misaligned trend', list, summary, { ...trends, monthly: { ...trends.monthly, sent: [] } }],
  ['missing breakdown', list, { ...summary, method_breakdown: undefined }, trends],
] as const)('fails closed for %s', (_label, listValue, summaryValue, trendValue) => {
  expect(() => projectPaymentAnalytics(listValue, summaryValue, trendValue)).toThrow();
});
