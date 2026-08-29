import { apiHelpers } from '../../apiClient';
import { customersApi } from './customers.api';
import { suppliersApi } from './suppliers.api';

jest.mock('../../apiClient', () => ({ apiHelpers: { get: jest.fn() } }));

const customer = {
  customer_id: 'd3000000-0000-7000-8000-000000000011',
  party_id: 'd3000000-0000-7000-8000-000000000021',
  customer_code: 'C-1', customer_name: 'Customer', trade_name: null,
  primary_phone: null, primary_email: null, gst_number: null,
  contact_person_name: null, pan_number: null,
  gst_verification_status: null, place_of_supply_state_code: null,
  credit_limit: '100.00', credit_days: 30, current_outstanding: '10.00',
  customer_type: 'organization', is_active: true, status: 'active',
  account_row_version: 1, party_row_version: 1,
  created_at: '2026-08-28T00:00:00Z', updated_at: '2026-08-28T00:00:00Z',
};

const supplier = {
  supplier_id: 'd3000000-0000-7000-8000-000000000012',
  party_id: 'd3000000-0000-7000-8000-000000000022',
  supplier_code: 'S-1', supplier_name: 'Supplier', trade_name: null,
  primary_phone: null, primary_email: null, gst_number: null,
  contact_person: null, pan_number: null,
  gst_verification_status: null, payment_days: 30, current_outstanding: '20.00',
  supplier_type: 'organization', is_active: true, status: 'active',
  account_row_version: 1, party_row_version: 1,
  created_at: '2026-08-28T00:00:00Z', updated_at: '2026-08-28T00:00:00Z',
};

beforeEach(() => jest.clearAllMocks());

test('customer master preserves exact money at the shared HTTP boundary', async () => {
  (apiHelpers.get as jest.Mock).mockResolvedValue({
    data: { customers: [customer], total: 1, skip: 0, limit: 100 },
  });
  await customersApi.getAll();
  expect(apiHelpers.get).toHaveBeenCalledWith('/customers', {
    params: {}, preserveExactDecimals: true,
  });
});

test('supplier master preserves exact money at the shared HTTP boundary', async () => {
  (apiHelpers.get as jest.Mock).mockResolvedValue({ data: [supplier] });
  await suppliersApi.getAll();
  expect(apiHelpers.get).toHaveBeenCalledWith('/suppliers', {
    params: {}, preserveExactDecimals: true,
  });
});
