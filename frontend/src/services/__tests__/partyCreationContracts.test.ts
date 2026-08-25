import { apiHelpers } from '../api/apiClient';
import {
  customersApi,
  toCanonicalCustomerCreate,
} from '../api/modules/master/customers.api';
import {
  suppliersApi,
  toCanonicalSupplierCreate,
} from '../api/modules/master/suppliers.api';
import { apiErrorMessage, apiErrorMessages } from '../api/utils/apiError';

jest.mock('../api/apiClient', () => ({
  apiHelpers: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('canonical party creation contracts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('maps the active customer form without legacy or tenant-owned fields', () => {
    const payload = toCanonicalCustomerCreate({
      customer_name: ' Browser Customer ',
      customer_type: 'organization',
      primary_phone: '+91 98765-43210',
      primary_email: 'buyer@example.com',
      whatsapp_number: '9876543210',
      drug_license_number: 'UI-ONLY-LICENCE',
      org_id: 'must-not-cross-the-boundary',
      credit_limit: '0.00',
      credit_days: 0,
      address_line1: 'Test Lane 1',
      city: 'Mumbai',
      state_code: '27',
      pincode: '400001',
    });

    expect(payload).toEqual({
      customer_name: ' Browser Customer ',
      customer_type: 'organization',
      primary_phone: '9876543210',
      primary_email: 'buyer@example.com',
      address_line1: 'Test Lane 1',
      city: 'Mumbai',
      state_code: '27',
      pincode: '400001',
      credit_limit: '0.00',
      credit_days: 0,
    });
    customersApi.create(payload);
    expect(apiHelpers.post).toHaveBeenCalledWith('/customers/', payload);
  });

  it('rejects missing customer classifications and commercial terms', () => {
    const complete = {
      customer_name: 'Explicit Customer',
      customer_type: 'organization',
      primary_phone: '9876543210',
      credit_limit: '0.00',
      credit_days: 0,
    };

    for (const field of ['customer_type', 'credit_limit', 'credit_days'] as const) {
      const input = { ...complete } as Record<string, unknown>;
      delete input[field];
      expect(() => toCanonicalCustomerCreate(input)).toThrow();
    }
  });

  it('maps only reviewed canonical supplier fields', () => {
    const payload = toCanonicalSupplierCreate({
      supplier_name: 'Browser Supplier',
      supplier_code: 'SUP-E2E',
      primary_phone: '98765 43210',
      primary_email: 'supplier@example.com',
      address_line1: 'Supplier Lane 1',
      city: 'Mumbai',
      state_code: '27',
      pincode: '400001',
      payment_days: '45',
      bank_name: 'must not cross',
      internal_notes: 'must not cross',
      org_id: 'must not cross',
    });

    expect(payload).toEqual({
      supplier_name: 'Browser Supplier',
      supplier_code: 'SUP-E2E',
      primary_phone: '9876543210',
      primary_email: 'supplier@example.com',
      address_line1: 'Supplier Lane 1',
      city: 'Mumbai',
      state_code: '27',
      pincode: '400001',
      payment_days: 45,
    });
    suppliersApi.create(payload);
    expect(apiHelpers.post).toHaveBeenCalledWith('/suppliers/', payload);
  });

  it('rejects a supplier without explicit payment days', () => {
    expect(() => toCanonicalSupplierCreate({ supplier_name: 'No terms' })).toThrow(
      'Supplier payment days must be selected explicitly.',
    );
  });

  it('rejects state names and GSTIN/address state-code mismatches before transport', () => {
    const customer = {
      customer_name: 'Mismatch Customer',
      customer_type: 'organization',
      primary_phone: '9876543210',
      credit_limit: '0.00',
      credit_days: 0,
      state_code: 'Maharashtra',
    };
    expect(() => toCanonicalCustomerCreate(customer)).toThrow(
      'GST state code must contain exactly 2 digits.',
    );
    expect(() => toCanonicalCustomerCreate({
      ...customer,
      state_code: undefined,
      state: 'Maharashtra',
    })).toThrow('State names are not accepted; enter the 2-digit GST state code.');

    expect(() => toCanonicalSupplierCreate({
      supplier_name: 'Mismatch Supplier',
      payment_days: 0,
      state_code: '29',
      gst_number: '27AAPFU0939F1ZV',
    })).toThrow('GSTIN state code must match the address GST state code.');
    expect(apiHelpers.post).not.toHaveBeenCalled();
  });

  it('requires canonical state_code for customer address mutations', () => {
    expect(() => customersApi.createAddress('customer-uuid', {
      address_line1: 'Test Lane', city: 'Mumbai', state: 'Maharashtra', pincode: '400001',
    })).toThrow('GST state code is required.');

    customersApi.createAddress('customer-uuid', {
      address_line1: 'Test Lane', city: 'Mumbai', state_code: '27', pincode: '400001',
      address_type: 'billing', is_default: true,
    });
    expect(apiHelpers.post).toHaveBeenCalledWith('/customers/customer-uuid/addresses/', {
      address_line1: 'Test Lane', city: 'Mumbai', state_code: '27', pincode: '400001',
      address_type: 'billing', is_default: true,
    });
  });

  it('turns FastAPI validation arrays into render-safe strings', () => {
    const error = {
      response: {
        data: {
          detail: [
            { loc: ['body', 'primary_phone'], msg: 'String should match pattern' },
            { loc: ['body', 'pincode'], msg: 'Field required' },
          ],
        },
      },
    };

    expect(apiErrorMessages(error, 'fallback')).toEqual([
      'body.primary_phone: String should match pattern',
      'body.pincode: Field required',
    ]);
    expect(apiErrorMessage(error, 'fallback')).toBe(
      'body.primary_phone: String should match pattern; body.pincode: Field required',
    );
  });

  it('fails closed instead of calling retired customer and supplier mutation routes', async () => {
    await expect(customersApi.update('customer-uuid', { customer_name: 'Changed' }))
      .rejects.toMatchObject({ code: 'CANONICAL_WRITE_UNAVAILABLE' });
    await expect(customersApi.delete('customer-uuid'))
      .rejects.toMatchObject({ code: 'CANONICAL_WRITE_UNAVAILABLE' });
    expect(customersApi).not.toHaveProperty('updateCreditLimit');
    expect(customersApi).not.toHaveProperty('sendSMS');
    await expect(suppliersApi.update('supplier-uuid', { supplier_name: 'Changed' }))
      .rejects.toMatchObject({ code: 'CANONICAL_WRITE_UNAVAILABLE' });
    await expect(suppliersApi.delete('supplier-uuid'))
      .rejects.toMatchObject({ code: 'CANONICAL_WRITE_UNAVAILABLE' });

    expect(apiHelpers.put).not.toHaveBeenCalled();
    expect(apiHelpers.delete).not.toHaveBeenCalled();
    expect(apiHelpers.post).not.toHaveBeenCalled();
  });
});
