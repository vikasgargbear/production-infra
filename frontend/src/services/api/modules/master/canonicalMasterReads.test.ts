import {
  decodeCanonicalBankAccountList,
  decodeCanonicalCustomerList,
  decodeCanonicalProductList,
} from './canonicalMasterReads';

const UUID7_A = 'd3000000-0000-7000-8000-000000000011';
const UUID7_B = 'd3000000-0000-7000-8000-000000000012';

test('customer decoder preserves explicit zero and rejects a missing amount', () => {
  const row = {
    customer_id: UUID7_A,
    party_id: UUID7_B,
    customer_code: 'C-1',
    customer_name: 'Customer One',
    trade_name: null,
    primary_phone: null,
    primary_email: null,
    contact_person_name: null,
    pan_number: null,
    gst_number: null,
    gst_verification_status: null,
    place_of_supply_state_code: null,
    credit_limit: '0.00',
    credit_days: 0,
    current_outstanding: '0.00',
    customer_type: 'organization',
    is_active: true,
    status: 'active',
    account_row_version: 1,
    party_row_version: 1,
    created_at: '2026-08-25T00:00:00Z',
    updated_at: '2026-08-25T00:00:00Z',
  };
  expect(decodeCanonicalCustomerList({ customers: [row], total: 1, skip: 0, limit: 20 }))
    .toEqual(expect.objectContaining({ customers: [expect.objectContaining({ current_outstanding: '0.00' })] }));
  expect(() => decodeCanonicalCustomerList({
    customers: [{ ...row, current_outstanding: undefined }], total: 1, skip: 0, limit: 20,
  })).toThrow('outstanding');
  expect(() => decodeCanonicalCustomerList({
    customers: [{ ...row, credit_limit: 0 }], total: 1, skip: 0, limit: 20,
  })).toThrow('exact two-decimal string');
});

test('product decoder accepts UUIDv7 and keeps missing GST distinct from zero', () => {
  const base = {
    product_id: UUID7_A,
    product_code: 'P-1',
    product_name: 'Product One',
    generic_name: null,
    product_type: 'medical_device',
    unit: 'EA',
    uom_conversion_id: UUID7_B,
    taxability: null,
    gst_percent: null,
    hsn_code: null,
    current_stock: '0.000000',
    is_active: true,
    status: 'active',
    row_version: 1,
  };
  expect(decodeCanonicalProductList({ products: [base], total: 1, offset: 0, limit: 20 })
    .products[0].gst_percent).toBeNull();
  expect(decodeCanonicalProductList({
    products: [{ ...base, taxability: 'taxable', gst_percent: '0.000000' }],
    total: 1, offset: 0, limit: 20,
  }).products[0].gst_percent).toBe('0.000000');
});

test('bank decoder exposes no alias, account number, balance, or default account', () => {
  const decoded = decodeCanonicalBankAccountList({
    bank_accounts: [{
      bank_account_id: UUID7_A,
      settlement_account_id: UUID7_B,
      settlement_account_code: 'BANK-1',
      settlement_account_name: 'Bank settlement',
      bank_name: 'Demo Bank',
      account_holder_name: 'Demo Company',
      ifsc: 'HDFC0000001',
      currency_code: 'INR',
      allows_bank_reconciliation: true,
      status: 'active',
    }],
    total: 1,
  });
  expect(decoded.bank_accounts[0]).not.toHaveProperty('id');
  expect(decoded.bank_accounts[0]).not.toHaveProperty('account_number');
  expect(decoded.bank_accounts[0]).not.toHaveProperty('balance');
  expect(decoded.bank_accounts[0]).not.toHaveProperty('is_default_account');
});
