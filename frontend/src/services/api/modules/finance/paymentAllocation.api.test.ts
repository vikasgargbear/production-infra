import { apiHelpers } from '../../apiClient';
import { paymentAllocationApi } from './paymentAllocation.api';

jest.mock('../../apiClient', () => ({ apiHelpers: { get: jest.fn() } }));

beforeEach(() => jest.clearAllMocks());

test('uses only canonical UUID allocation context and readback routes', async () => {
  (apiHelpers.get as jest.Mock).mockResolvedValue({ data: {} });
  const id = 'd3000000-0000-7000-8000-000000000001';

  await paymentAllocationApi.getUnpaidInvoices(id);
  await paymentAllocationApi.getInvoicePayments(id);
  await paymentAllocationApi.getCustomerReceiptReadback(id);
  await paymentAllocationApi.getCustomerChequeActionReadback(id);

  expect(apiHelpers.get).toHaveBeenNthCalledWith(1, '/payment-allocation/unpaid-invoices', {
    params: { customer_id: id },
  });
  expect(apiHelpers.get).toHaveBeenNthCalledWith(2, `/payment-allocation/invoice/${id}/payments`);
  expect(apiHelpers.get).toHaveBeenNthCalledWith(3, `/payment-allocation/payment/${id}/readback`);
  expect(apiHelpers.get).toHaveBeenNthCalledWith(4, `/payment-allocation/payment/${id}/cheque-action-readback`);
});

test('publishes no legacy allocation or mutation method', () => {
  expect(Object.keys(paymentAllocationApi).sort()).toEqual([
    'getCustomerChequeActionReadback', 'getCustomerReceiptReadback',
    'getInvoicePayments', 'getUnpaidInvoices',
  ]);
});
