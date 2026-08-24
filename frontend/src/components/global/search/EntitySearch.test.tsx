import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { customersApi, suppliersApi } from '../../../services/api';
import { CustomerSearch } from './CustomerSearch';
import { EntitySearch } from './EntitySearch';
import SupplierSearch from './SupplierSearch';

jest.mock('../../../services/api', () => ({
    customersApi: { search: jest.fn() },
    suppliersApi: { search: jest.fn() },
}));

jest.mock('../ui', () => ({
    ActionButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
        <button type="button" {...props}>{children}</button>
    ),
}));

type SearchItem = { id: string; label: string };

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    reject: (error: unknown) => void;
};

const deferred = <T,>(): Deferred<T> => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((accept, decline) => {
        resolve = accept;
        reject = decline;
    });
    return { promise, resolve, reject };
};

const renderEntitySearch = (searchFn: (query: string) => Promise<SearchItem[]>) => {
    const onChange = jest.fn();
    const onCreateNew = jest.fn();
    const view = render(
        <EntitySearch<SearchItem>
            value={null}
            onChange={onChange}
            onCreateNew={onCreateNew}
            searchFn={searchFn}
            minLength={2}
            debounceMs={100}
            placeholder="Find entity"
            getItemKey={(item) => item.id}
            getItemLabel={(item) => item.label}
        />,
    );
    return { ...view, onChange, onCreateNew };
};

describe('EntitySearch request ownership', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('invokes search exactly once for one settled query', async () => {
        const searchFn = jest.fn().mockResolvedValue([{ id: 'one', label: 'One result' }]);
        renderEntitySearch(searchFn);

        fireEvent.change(screen.getByPlaceholderText('Find entity'), {
            target: { value: 'one' },
        });
        await act(async () => { jest.advanceTimersByTime(99); });
        expect(searchFn).not.toHaveBeenCalled();

        await act(async () => { jest.advanceTimersByTime(1); });
        expect(searchFn).toHaveBeenCalledTimes(1);
        expect(searchFn).toHaveBeenCalledWith('one');
        expect(screen.getByText('One result')).toBeTruthy();
    });

    it('cancels superseded debounce work during rapid query changes', async () => {
        const searchFn = jest.fn().mockResolvedValue([]);
        renderEntitySearch(searchFn);
        const input = screen.getByPlaceholderText('Find entity');

        fireEvent.change(input, { target: { value: 'ol' } });
        await act(async () => { jest.advanceTimersByTime(50); });
        fireEvent.change(input, { target: { value: 'older' } });
        await act(async () => { jest.advanceTimersByTime(50); });
        fireEvent.change(input, { target: { value: 'latest' } });
        await act(async () => { jest.advanceTimersByTime(100); });

        expect(searchFn).toHaveBeenCalledTimes(1);
        expect(searchFn).toHaveBeenCalledWith('latest');
    });

    it('does not let an older success overwrite the latest results', async () => {
        const older = deferred<SearchItem[]>();
        const latest = deferred<SearchItem[]>();
        const searchFn = jest.fn()
            .mockReturnValueOnce(older.promise)
            .mockReturnValueOnce(latest.promise);
        renderEntitySearch(searchFn);
        const input = screen.getByPlaceholderText('Find entity');

        fireEvent.change(input, { target: { value: 'older' } });
        await act(async () => { jest.advanceTimersByTime(100); });
        fireEvent.change(input, { target: { value: 'latest' } });
        await act(async () => { jest.advanceTimersByTime(100); });

        await act(async () => { latest.resolve([{ id: 'latest', label: 'Latest result' }]); });
        expect(screen.getByText('Latest result')).toBeTruthy();

        await act(async () => { older.resolve([{ id: 'older', label: 'Older result' }]); });
        expect(screen.queryByText('Older result')).toBeNull();
        expect(screen.getByText('Latest result')).toBeTruthy();
    });

    it('does not let an older error clear the latest loading state', async () => {
        const older = deferred<SearchItem[]>();
        const latest = deferred<SearchItem[]>();
        const searchFn = jest.fn()
            .mockReturnValueOnce(older.promise)
            .mockReturnValueOnce(latest.promise);
        const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        renderEntitySearch(searchFn);
        const input = screen.getByPlaceholderText('Find entity');

        fireEvent.change(input, { target: { value: 'older' } });
        await act(async () => { jest.advanceTimersByTime(100); });
        fireEvent.change(input, { target: { value: 'latest' } });
        await act(async () => { jest.advanceTimersByTime(100); });

        await act(async () => { older.reject(new Error('stale failure')); });
        expect(screen.getByText('Searching...')).toBeTruthy();
        expect(consoleError).not.toHaveBeenCalled();

        await act(async () => { latest.resolve([{ id: 'latest', label: 'Latest result' }]); });
        expect(screen.getByText('Latest result')).toBeTruthy();
        consoleError.mockRestore();
    });

    it('cancels a pending debounce when unmounted', async () => {
        const searchFn = jest.fn().mockResolvedValue([]);
        const { unmount } = renderEntitySearch(searchFn);

        fireEvent.change(screen.getByPlaceholderText('Find entity'), {
            target: { value: 'pending' },
        });
        unmount();
        await act(async () => { jest.advanceTimersByTime(100); });

        expect(searchFn).not.toHaveBeenCalled();
    });

    it('ignores an in-flight completion after unmount', async () => {
        const inFlight = deferred<SearchItem[]>();
        const searchFn = jest.fn().mockReturnValue(inFlight.promise);
        const { unmount } = renderEntitySearch(searchFn);

        fireEvent.change(screen.getByPlaceholderText('Find entity'), {
            target: { value: 'started' },
        });
        await act(async () => { jest.advanceTimersByTime(100); });
        expect(searchFn).toHaveBeenCalledTimes(1);

        unmount();
        await act(async () => { inFlight.resolve([{ id: 'late', label: 'Late result' }]); });
        expect(screen.queryByText('Late result')).toBeNull();
    });

    it('keeps keyboard selection and the create CTA behavior', async () => {
        const searchFn = jest.fn()
            .mockResolvedValueOnce([{ id: 'one', label: 'One result' }])
            .mockResolvedValueOnce([]);
        const { onChange, onCreateNew } = renderEntitySearch(searchFn);
        const input = screen.getByPlaceholderText('Find entity');

        fireEvent.change(input, { target: { value: 'one' } });
        await act(async () => { jest.advanceTimersByTime(100); });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith({ id: 'one', label: 'One result' });

        onChange.mockClear();
        fireEvent.change(screen.getByPlaceholderText('Find entity'), {
            target: { value: 'missing' },
        });
        await act(async () => { jest.advanceTimersByTime(100); });
        fireEvent.click(screen.getByRole('button', { name: 'Create New "missing"' }));
        expect(onCreateNew).toHaveBeenCalledWith('missing');
    });
});

describe('customer and supplier search adapters', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('issues one canonical customer request for one query, including a parent rerender', async () => {
        (customersApi.search as jest.Mock).mockResolvedValue({
            data: { customers: [{ customer_id: 'customer-1', customer_name: 'Customer One' }] },
        });
        const onChange = jest.fn();
        const { rerender } = render(<CustomerSearch value={null} onChange={onChange} />);
        fireEvent.change(screen.getByPlaceholderText(/Search customer/i), {
            target: { value: 'Customer' },
        });
        await act(async () => { jest.advanceTimersByTime(100); });
        rerender(<CustomerSearch value={null} onChange={onChange} className="rerendered" />);

        expect(customersApi.search).toHaveBeenCalledTimes(1);
        expect(customersApi.search).toHaveBeenCalledWith('Customer', { limit: 20 });
        expect(screen.getByText('Customer One')).toBeTruthy();
    });

    it('issues one canonical supplier request for one query, including a parent rerender', async () => {
        (suppliersApi.search as jest.Mock).mockResolvedValue({
            data: [{ supplier_id: 'supplier-1', supplier_name: 'Supplier One' }],
        });
        const onChange = jest.fn();
        const { rerender } = render(<SupplierSearch value={null} onChange={onChange} />);
        fireEvent.change(screen.getByPlaceholderText(/Search supplier/i), {
            target: { value: 'Supplier' },
        });
        await act(async () => { jest.advanceTimersByTime(100); });
        rerender(<SupplierSearch value={null} onChange={onChange} className="rerendered" />);

        expect(suppliersApi.search).toHaveBeenCalledTimes(1);
        expect(suppliersApi.search).toHaveBeenCalledWith('Supplier', { limit: 20 });
        expect(screen.getByText('Supplier One')).toBeTruthy();
    });
});
