import { canonicalSupplierPaymentsApi, reconcileSupplierPayment } from './canonicalSupplierPayments.api';
import { apiHelpers } from '../../apiClient';

jest.mock('../../apiClient', () => ({ apiHelpers: { get: jest.fn(), post: jest.fn() } }));

const ids = {
  payment: 'd3000000-0000-7000-8000-000000000001',
  supplier: 'd3000000-0000-7000-8000-000000000002',
  branch: 'd3000000-0000-7000-8000-000000000003',
  bank: 'd3000000-0000-7000-8000-000000000004',
  settlement: 'd3000000-0000-7000-8000-000000000005',
  item: 'd3000000-0000-7000-8000-000000000006',
};
const payload: any = {
  supplier_account_id: ids.supplier, branch_id: ids.branch,
  bank_account_id: ids.bank,
  external_reference: 'upi-ref', expected_gross_amount: '40.01',
  allocations: [{ open_item_id: ids.item, cash_amount: '40.01' }],
};
const posted = (): any => ({
  payment_id: ids.payment, status: 'posted', supplier_account_id: ids.supplier,
  branch_id: ids.branch, bank_account_id: ids.bank, settlement_account_id: ids.settlement,
  external_reference: 'UPI-REF', amount: '40.01',
  allocation_reconciled: true, journal_balanced: true, payable_residuals_reconciled: true,
  allocations: [{ open_item_id: ids.item, amount: '40.01', principal_amount: '100.03', effective_allocated_amount: '60.02', residual_amount: '40.01' }],
});

test('lets the backend choose the authoritative organization date on bootstrap', async () => {
  (apiHelpers.get as jest.Mock).mockResolvedValue({ data: {} });
  await canonicalSupplierPaymentsApi.getContext();
  expect(apiHelpers.get).toHaveBeenCalledWith('/canonical/supplier-payments/context');

  await canonicalSupplierPaymentsApi.getContext('2026-08-24');
  expect(apiHelpers.get).toHaveBeenLastCalledWith(
    '/canonical/supplier-payments/context',
    { params: { payment_date: '2026-08-24' } },
  );
});

test('reconciles exact allocations and payable residual strings', async () => {
  jest.spyOn(canonicalSupplierPaymentsApi, 'getPosted').mockResolvedValue({ data: posted() } as any);
  await expect(reconcileSupplierPayment(ids.payment, payload)).resolves.toMatchObject({ payment_id: ids.payment });
});

test.each([
  [{ amount: '40.02' }, 'did not reconcile'],
  [{ allocations: [{ ...posted().allocations[0], residual_amount: '40.00' }] }, 'did not reconcile'],
  [{ journal_balanced: false }, 'did not reconcile'],
])('fails closed when posted data drifts', async (override, message) => {
  jest.spyOn(canonicalSupplierPaymentsApi, 'getPosted').mockResolvedValue({ data: { ...posted(), ...override } } as any);
  await expect(reconcileSupplierPayment(ids.payment, payload)).rejects.toThrow(message);
});
