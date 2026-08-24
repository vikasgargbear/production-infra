import { apiHelpers } from '../../apiClient';
import {
  canonicalBusinessContextApi,
  requireCanonicalBusinessContext,
} from './canonicalBusinessContext.api';

jest.mock('../../apiClient', () => ({
  apiHelpers: { get: jest.fn() },
}));

const get = apiHelpers.get as jest.Mock;

beforeEach(() => get.mockReset());

it('loads the authenticated server-owned organization business date', async () => {
  get.mockResolvedValue({ data: {
    organization_id: 'd1000000-0000-7000-8000-000000000001',
    organization_timezone: 'Asia/Kolkata',
    business_date: '2026-08-25',
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
])('fails closed for invalid business context %#', value => {
  expect(() => requireCanonicalBusinessContext(value)).toThrow();
});
