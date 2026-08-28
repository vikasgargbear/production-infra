import { act, renderHook, waitFor } from '@testing-library/react';
import { canonicalBusinessContextApi } from '../services/api/modules/org/canonicalBusinessContext.api';
import { useCanonicalBusinessDate } from './useCanonicalBusinessDate';

jest.mock('../services/api/modules/org/canonicalBusinessContext.api', () => ({
  canonicalBusinessContextApi: { get: jest.fn() },
}));

const getBusinessContext = canonicalBusinessContextApi.get as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(new Date('2026-08-24T18:30:00.000Z'));
  getBusinessContext.mockReset();
});

afterEach(() => jest.useRealTimers());

it('uses the server business date at IST midnight even when the UTC date is previous', async () => {
  getBusinessContext.mockResolvedValue({
    organization_id: 'd1000000-0000-7000-8000-000000000001',
    organization_timezone: 'Asia/Kolkata',
    business_date: '2026-08-25',
  });
  const { result } = renderHook(() => useCanonicalBusinessDate());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.businessDate).toBe('2026-08-25');
  expect(result.current.organizationTimezone).toBe('Asia/Kolkata');
});

it('fails closed without substituting the client clock when the API fails', async () => {
  getBusinessContext.mockRejectedValue(new Error('Business clock unavailable'));
  const { result } = renderHook(() => useCanonicalBusinessDate());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.businessDate).toBe('');
  expect(result.current.error).toBe('Business clock unavailable');
});

it('retries the authoritative API in place after a transient failure', async () => {
  getBusinessContext
    .mockRejectedValueOnce(new Error('Business clock unavailable'))
    .mockResolvedValueOnce({
      organization_id: 'd1000000-0000-7000-8000-000000000001',
      organization_timezone: 'Asia/Kolkata',
      business_date: '2026-08-25',
    });
  const { result } = renderHook(() => useCanonicalBusinessDate());
  await waitFor(() => expect(result.current.error).toBe('Business clock unavailable'));

  act(() => result.current.retry());
  await waitFor(() => expect(result.current.businessDate).toBe('2026-08-25'));

  expect(result.current.error).toBe('');
  expect(getBusinessContext).toHaveBeenCalledTimes(2);
});
