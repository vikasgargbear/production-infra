import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ProductSearch from './ProductSearch';
import { productsApi } from '../../../services/api';

jest.mock('../../../services/api', () => ({
    productsApi: { search: jest.fn() },
}));

jest.mock('../selector/BatchSelector', () => () => null);

const row = (name: string) => ({
    product_id: 'd3000000-0000-7000-8000-000000000015',
    product_code: `SKU-${name}`,
    product_name: name,
    product_type: 'medicine',
    hsn_code: '481910',
    uom_conversion_id: 'd3000000-0000-7000-8000-000000000016',
    gst_percent: '12.000000',
    current_stock: '99999999999999.123456',
    requires_prescription: false,
});

describe('ProductSearch canonical request lifecycle', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => jest.useRealTimers());

    it('issues one debounced request for one typed query', async () => {
        (productsApi.search as jest.Mock).mockResolvedValue({ data: [row('Exact Product')] });
        render(<ProductSearch onAddItem={jest.fn()} />);

        fireEvent.change(screen.getByPlaceholderText(/Search products/i), {
            target: { value: 'Exact' },
        });
        await act(async () => { jest.advanceTimersByTime(100); });

        expect(productsApi.search).toHaveBeenCalledTimes(1);
        expect(productsApi.search).toHaveBeenCalledWith('Exact', { limit: 20 });
        expect(await screen.findByText('Exact Product')).toBeTruthy();
        expect(screen.getByText('Stock: 99999999999999.123456')).toBeTruthy();
        expect(screen.getByTestId(
            'product-search-option-d3000000-0000-7000-8000-000000000015',
        )).toBeTruthy();
    });

    it('does not let an older response overwrite a newer query', async () => {
        let resolveOlder!: (value: unknown) => void;
        const older = new Promise(resolve => { resolveOlder = resolve; });
        (productsApi.search as jest.Mock)
            .mockReturnValueOnce(older)
            .mockResolvedValueOnce({ data: [row('Newer Product')] });
        render(<ProductSearch onAddItem={jest.fn()} />);
        const input = screen.getByPlaceholderText(/Search products/i);

        fireEvent.change(input, { target: { value: 'Older' } });
        await act(async () => { jest.advanceTimersByTime(100); });
        fireEvent.change(input, { target: { value: 'Newer' } });
        await act(async () => { jest.advanceTimersByTime(100); });
        expect(await screen.findByText('Newer Product')).toBeTruthy();

        await act(async () => { resolveOlder({ data: [row('Older Product')] }); });
        expect(screen.queryByText('Older Product')).toBeNull();
        expect(screen.getByText('Newer Product')).toBeTruthy();
    });

    it('fails closed when an authoritative decimal arrives as a JSON number', async () => {
        (productsApi.search as jest.Mock).mockResolvedValue({
            data: [{ ...row('Unsafe Product'), current_stock: 1 }],
        });
        render(<ProductSearch onAddItem={jest.fn()} />);

        fireEvent.change(screen.getByPlaceholderText(/Search products/i), {
            target: { value: 'Unsafe' },
        });
        await act(async () => { jest.advanceTimersByTime(100); });

        expect(screen.queryByText('Unsafe Product')).toBeNull();
    });

    it('honors accessible disabled guidance without issuing a request', async () => {
        const { rerender } = render(
            <ProductSearch onAddItem={jest.fn()} disabled placeholder="Select transfer branches first" />,
        );
        const input = screen.getByPlaceholderText('Select transfer branches first');
        expect((input as HTMLInputElement).disabled).toBe(true);
        fireEvent.change(input, { target: { value: 'Exact' } });
        await act(async () => { jest.advanceTimersByTime(100); });
        expect(productsApi.search).not.toHaveBeenCalled();

        rerender(<ProductSearch onAddItem={jest.fn()} placeholder="Search transfer product" />);
        expect((screen.getByPlaceholderText('Search transfer product') as HTMLInputElement).disabled).toBe(false);
    });
});
