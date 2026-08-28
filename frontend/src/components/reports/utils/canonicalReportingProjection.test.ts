import {
  projectCustomerActivity,
  projectProfitLoss,
  projectTrialBalance,
} from './canonicalReportingProjection';

const header = {
  contract_version: '1.0.0', definition_version: 'canonical-factual-v1',
  currency_code: 'INR',
  date_from: '2026-08-01', date_to: '2026-08-31',
};

test('projects exact trial balance and rejects numeric money', () => {
  const payload = {
    ...header,
    rows: [{
      account_id: '018f0000-0000-7000-8000-000000000001', account_code: '1100',
      account_name: 'Receivables', account_type: 'asset',
      opening_balance: '9007199254740993.01', period_debit: '0.10',
      period_credit: '0.01', closing_balance: '9007199254740993.10',
    }],
    total_period_debit: '0.10', total_period_credit: '0.01', period_balanced: false,
  };
  expect(projectTrialBalance(payload).rows[0].closing_balance).toBe('9007199254740993.10');
  expect(() => projectTrialBalance({ ...payload, total_period_debit: 0.1 })).toThrow('exact decimal string');
});

test('reconciles factual profit and loss without margin policy', () => {
  const result = projectProfitLoss({
    ...header, income: '100.00', expenses: '40.00', result: '60.00',
    rows: [
      { account_id: '018f0000-0000-7000-8000-000000000001', account_code: '4000', account_name: 'Sales', account_type: 'income', amount: '100.00' },
      { account_id: '018f0000-0000-7000-8000-000000000002', account_code: '5000', account_name: 'Expense', account_type: 'expense', amount: '40.00' },
    ],
  });
  expect(result.result).toBe('60.00');
});

test('reconciles factual customer billed activity and closed accounts', () => {
  const result = projectCustomerActivity({
    ...header, transacting_customer_count: 1, invoice_count: 2, billed_sales: '30.00',
    customers: [{
      customer_account_id: '018f0000-0000-7000-8000-000000000001',
      party_id: '018f0000-0000-7000-8000-000000000002', customer_code: 'CUST-1',
      customer_name: 'Buyer', account_status: 'closed', invoice_count: 2,
      billed_sales: '30.00', first_invoice_date: '2026-08-01', last_invoice_date: '2026-08-02',
    }],
  });
  expect(result.customers[0].account_status).toBe('closed');
  expect(result.billed_sales).toBe('30.00');
});
