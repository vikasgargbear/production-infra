import { applySelectedDeliveryAddress } from './invoiceAddressSelection';

const address = {
  address_line1: '101 E2E Test Lane',
  city: 'Mumbai',
  state_code: '27',
  pincode: '400001',
};

test('first saved delivery address establishes billing and delivery state', () => {
  const result = applySelectedDeliveryAddress(
    { billing_address: '', shipping_address: '' } as any,
    address,
    'Maharashtra',
    'CGST/SGST',
  );

  expect(result.billing_address).toBe('101 E2E Test Lane, Mumbai, Maharashtra, 400001');
  expect(result.shipping_address).toBe(result.billing_address);
  expect((result.shipping_address_data as any).state).toBe('Maharashtra');
  expect(result.gst_type).toBe('CGST/SGST');
});

test('alternate delivery address preserves the confirmed billing address', () => {
  const result = applySelectedDeliveryAddress(
    {
      billing_address: 'Original billing address',
      billing_address_data: { state_code: '27' },
    } as any,
    { ...address, address_line1: '202 Alternate Lane', state_code: '08' },
    'Rajasthan',
    'IGST',
  );

  expect(result.billing_address).toBe('Original billing address');
  expect(result.shipping_address).toBe('202 Alternate Lane, Mumbai, Rajasthan, 400001');
  expect(result.gst_type).toBe('IGST');
});
