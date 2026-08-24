import { projectTopCustomer } from './topCustomerProjection';

test('preserves canonical top-customer revenue instead of defaulting it to zero', () => {
  expect(projectTopCustomer({ name: 'Demo Retail', revenue: 4596, orders: 3 })).toMatchObject({
    name: 'Demo Retail',
    revenue: 4596,
    orders: 3,
  });
});

test('marks absent revenue unavailable rather than inventing zero', () => {
  expect(projectTopCustomer({ customer_name: 'No revenue contract' }).revenue).toBeNull();
});
