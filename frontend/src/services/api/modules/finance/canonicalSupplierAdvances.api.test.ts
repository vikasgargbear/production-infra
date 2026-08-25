import { apiHelpers } from '../../apiClient';
import {
  canonicalExecutionCompleted,
  executeApprovedCanonicalAction,
  prepareCanonicalAction,
} from '../../canonicalOperatorActions';
import {
  canonicalSupplierAdvancesApi,
  executeApprovedSupplierAdvance,
  prepareSupplierAdvance,
  reconcileSupplierAdvance,
} from './canonicalSupplierAdvances.api';

jest.mock('../../apiClient', () => ({ apiHelpers: { get: jest.fn() } }));
jest.mock('../../canonicalOperatorActions', () => ({
  prepareCanonicalAction: jest.fn(),
  executeApprovedCanonicalAction: jest.fn(),
  canonicalExecutionCompleted: jest.fn(),
}));

const ids = {
  supplier: 'd3200000-0000-7000-8000-000000000002',
  party: 'd3200000-0000-7000-8000-000000000003',
  branch: 'd3000000-0000-7000-8000-000000000004',
  bank: 'd3000000-0000-7000-8000-000000000005',
  settlement: 'd3000000-0000-7000-8000-000000000006',
  order: 'd3000000-0000-7000-8000-000000000007',
  line: 'd3000000-0000-7000-8000-000000000008',
  product: 'd3000000-0000-7000-8000-000000000009',
  command: 'd3000000-0000-7000-8000-000000000010',
  payment: 'd3000000-0000-7000-8000-000000000011',
  prepayment: 'd3000000-0000-7000-8000-000000000012',
  allocation: 'd3000000-0000-7000-8000-000000000013',
  event: 'd3000000-0000-7000-8000-000000000014',
  journal: 'd3000000-0000-7000-8000-000000000015',
};
const payload: any = {
  idempotency_key: 'advance:attempt-0001', branch_id: ids.branch,
  payment_date: '2026-08-25', supplier_account_id: ids.supplier,
  purchase_order_id: ids.order, settlement_account_id: ids.settlement,
  bank_account_id: ids.bank, payment_method: 'upi', gross_amount: '168.01',
  allocations: [{ purchase_order_line_id: ids.line, gross_amount: '168.01' }],
  external_reference: 'UPI-SA-1',
};

beforeEach(() => jest.clearAllMocks());

it('uses dedicated supplier-advance context and readback endpoints', async () => {
  (apiHelpers.get as jest.Mock).mockResolvedValue({ data: {} });
  await canonicalSupplierAdvancesApi.getContext('2026-08-25');
  await canonicalSupplierAdvancesApi.getPosted(ids.payment);
  expect(apiHelpers.get).toHaveBeenNthCalledWith(1, '/canonical/supplier-advances/context', {
    params: { payment_date: '2026-08-25' },
  });
  expect(apiHelpers.get).toHaveBeenNthCalledWith(2, `/canonical/supplier-advances/${ids.payment}`);
});

it('rejects immutable preview drift before any approval', async () => {
  (prepareCanonicalAction as jest.Mock).mockResolvedValue({ data: {
    command_request_id: ids.command, preview_hash: `sha256:${'a'.repeat(64)}`,
    operation: 'finance.supplier_advance.post', capability_code: 'finance.supplier_advance.prepare',
    branch_id: ids.branch, target_resource_type: 'payment', target_resource_id: ids.payment,
    inventory_impact: [], tax_impact: [], financial_impact: [{
      gross_advance_amount: '168.01', cash_disbursed_amount: '168.01', withheld_amount: '0.01',
      purchase_order_id: ids.order, purchase_order_line_id: ids.line,
      settlement_account_id: ids.settlement, supplier_prepayment_account_id: ids.prepayment,
    }],
  } });
  await expect(prepareSupplierAdvance(payload)).rejects.toThrow(/withholding differs/i);
  expect(executeApprovedCanonicalAction).not.toHaveBeenCalled();
});

it('executes an already approved preview without self-approving it', async () => {
  (canonicalExecutionCompleted as jest.Mock).mockReturnValue(true);
  (executeApprovedCanonicalAction as jest.Mock).mockResolvedValue({ data: {
    status: 'executed', resource_id: ids.payment,
  } });
  await expect(executeApprovedSupplierAdvance({
    command_request_id: ids.command, preview_hash: `sha256:${'a'.repeat(64)}`,
  }, 'execute-once')).resolves.toBe(ids.payment);
  expect(executeApprovedCanonicalAction).toHaveBeenCalledWith(
    'finance.supplier_advance.prepare', expect.any(Object), 'execute-once',
  );
});

it('accepts success only after exact PO, prepayment, withholding, and journal readback', async () => {
  (apiHelpers.get as jest.Mock).mockResolvedValue({ data: {
    payment_id: ids.payment, payment_number: 'SA-1', payment_date: '2026-08-25',
    branch_id: ids.branch, supplier_account_id: ids.supplier, supplier_name: 'Supplier',
    party_id: ids.party, bank_account_id: ids.bank, settlement_account_id: ids.settlement,
    supplier_prepayment_account_id: ids.prepayment, payment_method: 'upi',
    external_reference: 'UPI-SA-1', cash_disbursed_amount: '168.01',
    gross_advance_amount: '168.01', withheld_amount: '0.00', status: 'posted',
    accounting_event_id: ids.event, journal_entry_id: ids.journal, journal_number: 'JRN-1',
    journal_debit_total: '168.01', journal_credit_total: '168.01',
    allocations: [{ allocation_id: ids.allocation, purchase_order_id: ids.order,
      purchase_order_number: 'PO-1', purchase_order_line_id: ids.line, line_number: 1,
      product_id: ids.product, product_code: 'SKU', product_name: 'Product',
      prepayment_open_item_id: ids.prepayment, cash_disbursed_amount: '168.01',
      withheld_amount: '0.00', gross_advance_amount: '168.01',
      prepayment_principal_amount: '168.01', withholding_id: null,
      allocation_date: '2026-08-25', status: 'posted' }],
    journal_lines: [], allocation_reconciled: true, journal_balanced: true,
    prepayment_reconciled: true, withholding_reconciled: true,
  } });
  await expect(reconcileSupplierAdvance(ids.payment, payload)).resolves.toMatchObject({
    payment_id: ids.payment, gross_advance_amount: '168.01', withheld_amount: '0.00',
  });
});
