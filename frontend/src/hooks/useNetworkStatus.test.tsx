import { act, renderHook, waitFor } from '@testing-library/react';
import { useNetworkStatus } from './useNetworkStatus';

const setBrowserOnline = (online: boolean): void => {
    Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        value: online,
    });
};

describe('useNetworkStatus', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        jest.restoreAllMocks();
    });

    it('reports authoritative API availability without exposing legacy sync state', async () => {
        setBrowserOnline(true);
        global.fetch = jest.fn().mockResolvedValue({ ok: true }) as jest.Mock;

        const { result } = renderHook(() => useNetworkStatus());

        await waitFor(() => expect(result.current.isOnline).toBe(true));
        expect(Object.keys(result.current)).toEqual(['isOnline']);
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringMatching(/\/health$/),
            expect.objectContaining({ method: 'GET', cache: 'no-store' }),
        );
    });

    it('reports unavailable immediately when the browser has no network', async () => {
        setBrowserOnline(false);
        global.fetch = jest.fn() as jest.Mock;

        const { result } = renderHook(() => useNetworkStatus());

        await act(async () => undefined);
        expect(result.current.isOnline).toBe(false);
        expect(global.fetch).not.toHaveBeenCalled();
    });
});
