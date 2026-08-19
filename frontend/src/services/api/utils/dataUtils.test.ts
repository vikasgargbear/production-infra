import { normalizeMoneyResponse } from './dataUtils';


test('normalizes canonical money strings for legacy numeric UI models', () => {
  const response = normalizeMoneyResponse({
    total_amount: '1234.50',
    summary: {
      total_outstanding: '9007199254740991.00',
      collection_efficiency: 82
    },
    lines: [
      { allocated_amount: '0.30', invoice_number: '0001.00' },
      { allocated_amount: '-1.01' }
    ]
  });

  expect(response).toEqual({
    total_amount: 1234.5,
    summary: {
      total_outstanding: 9007199254740991,
      collection_efficiency: 82
    },
    lines: [
      { allocated_amount: 0.3, invoice_number: '0001.00' },
      { allocated_amount: -1.01 }
    ]
  });
});

test('does not coerce non-money fields or non-canonical values', () => {
  const response = normalizeMoneyResponse({
    invoice_number: '1234.50',
    total_amount: '1234.5',
    amount: 'NaN',
    count: '2.00',
    nullable: null
  });

  expect(response).toEqual({
    invoice_number: '1234.50',
    total_amount: '1234.5',
    amount: 'NaN',
    count: '2.00',
    nullable: null
  });
});

test('normalizes residual inventory, purchasing, and compliance money fields', () => {
  expect(normalizeMoneyResponse({
    mrp_per_unit: '101.25',
    cost_price: '84.50',
    rate: '84.50',
    invoice_value: '999.99',
    total_itc_at_risk: '18.00',
    amount_difference: '-0.50'
  })).toEqual({
    mrp_per_unit: 101.25,
    cost_price: 84.5,
    rate: 84.5,
    invoice_value: 999.99,
    total_itc_at_risk: 18,
    amount_difference: -0.5
  });
});
