import { apiHelpers } from '../../apiClient';
import {
  canonicalBusinessContextApi,
  requireCanonicalBusinessContext,
} from './canonicalBusinessContext.api';

jest.mock('../../apiClient', () => ({
  apiHelpers: { get: jest.fn() },
}));

const get = apiHelpers.get as jest.Mock;

const documentPolicy = {
  allowed_rounding_policies: ['none'], default_rounding_policy: 'none',
  allowed_zero_rated_payment_modes: ['not_applicable', 'with_igst'],
  default_zero_rated_payment_mode: 'not_applicable',
  allowed_tax_charge_mechanisms: ['normal'], default_tax_charge_mechanism: 'normal',
  allowed_price_bases: ['tax_exclusive'], default_price_basis: 'tax_exclusive',
  logistics_modes: [{
    transport_mode: 'in_person', display_name: 'In person (no carrier)',
    requires_transporter_party: false, requires_vehicle: false,
    requires_transport_document: false,
  }],
  default_transport_mode: 'in_person',
};

beforeEach(() => get.mockReset());

it('loads the authenticated server-owned organization business date', async () => {
  get.mockResolvedValue({ data: {
    organization_id: 'd1000000-0000-7000-8000-000000000001',
    organization_timezone: 'Asia/Kolkata',
    business_date: '2026-08-25',
    document_policy: documentPolicy,
  } });
  await expect(canonicalBusinessContextApi.get()).resolves.toMatchObject({
    organization_timezone: 'Asia/Kolkata',
    business_date: '2026-08-25',
  });
  expect(get).toHaveBeenCalledWith('/canonical/business-context');
});

it.each([
  null,
  {},
  { organization_id: 'x', organization_timezone: 'Not/AZone', business_date: '2026-08-25' },
  { organization_id: 'x', organization_timezone: 'Asia/Kolkata', business_date: '24/08/2026' },
  { organization_id: 'x', organization_timezone: 'Asia/Kolkata', business_date: '2026-08-25' },
  { organization_id: 'x', organization_timezone: 'Asia/Kolkata', business_date: '2026-08-25', document_policy: { ...documentPolicy, allowed_rounding_policies: ['none', 'nearest_rupee'] } },
  { organization_id: 'x', organization_timezone: 'Asia/Kolkata', business_date: '2026-08-25', document_policy: {
    ...documentPolicy, allowed_zero_rated_payment_modes: ['not_applicable'],
  } },
  { organization_id: 'x', organization_timezone: 'Asia/Kolkata', business_date: '2026-08-25', document_policy: {
    ...documentPolicy,
    allowed_zero_rated_payment_modes: ['not_applicable', 'without_payment', 'with_igst'],
  } },
])('fails closed for invalid business context %#', value => {
  expect(() => requireCanonicalBusinessContext(value)).toThrow();
});
