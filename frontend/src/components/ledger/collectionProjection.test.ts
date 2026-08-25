import { projectCollectionAging } from './collectionProjection';

const payload = {
  summary: {
    totalOutstanding: '168.00',
    overdueAmount: '168.00',
    currentDayCollections: '0.00',
    currentWeekCollections: '0.00',
    currentMonthCollections: '0.00',
    collectionEfficiency: null,
  },
  parties: [{
    id: '10000000-0000-7000-8000-000000000001',
    partyId: '10000000-0000-7000-8000-000000000002',
    name: 'Canonical Customer',
    phone: null,
    email: null,
    location: null,
    outstandingAmount: '168.00',
    overdueAmount: '168.00',
    daysOverdue: 1,
    oldestInvoiceDate: '2026-08-24',
    lastPayment: null,
    agingStatus: 'overdue',
    agingBand: '1-30',
    agingBreakdown: [],
  }],
};

test('preserves nullable contacts and explicit zero collection facts', () => {
  const result = projectCollectionAging(payload);
  expect(result.collections[0]).toMatchObject({
    customer_phone: null,
    customer_email: null,
    last_payment_date: null,
    days_overdue: 1,
  });
  expect(result.stats.collections_today).toBe('0.00');
  expect(result.stats.customers_count).toBe(1);
});

test.each([
  ['missing party array', { ...payload, parties: undefined }],
  ['integer legacy identity', { ...payload, parties: [{ ...payload.parties[0], id: 7 }] }],
  ['invented missing customer name', { ...payload, parties: [{ ...payload.parties[0], name: null }] }],
  ['missing overdue days', { ...payload, parties: [{ ...payload.parties[0], daysOverdue: null }] }],
  ['unsupported status', { ...payload, parties: [{ ...payload.parties[0], agingStatus: 'unknown' }] }],
  ['published efficiency without target', { ...payload, summary: { ...payload.summary, collectionEfficiency: 82 } }],
] as const)('fails closed for %s', (_label, value) => {
  expect(() => projectCollectionAging(value)).toThrow();
});
