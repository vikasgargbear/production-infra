import { act, renderHook, waitFor } from '@testing-library/react';
import { employeesApi } from '../../../services/api';
import type { BaseLineItem } from '../types/salesSharedTypes';
import { useSalesTransaction } from './useSalesTransaction';

jest.mock('../../../services/api', () => ({
    employeesApi: { getAll: jest.fn() },
    apiClient: { get: jest.fn() },
}));

type Draft = { items: BaseLineItem[] };

const selectedProduct = (quantity: unknown, freeQuantity: unknown) => ({
    product_id: 'd3000000-0000-7000-8000-000000000001',
    product_name: 'Exact product',
    batch_id: 'd3000000-0000-7000-8000-000000000002',
    batch_number: 'BATCH-1',
    branch_id: 'd3000000-0000-7000-8000-000000000003',
    location_id: 'd3000000-0000-7000-8000-000000000004',
    uom_conversion_id: 'd3000000-0000-7000-8000-000000000005',
    quantity,
    free_quantity: freeQuantity,
    sale_price: '9007199254740993.1250',
    mrp: '9007199254740993.2500',
    quantity_available: '20.000000',
    gst_percent: '12.000000',
    free_supply_tax_treatment: 'included_at_unit_rate',
});

describe('useSalesTransaction exact selection boundary', () => {
    beforeEach(() => {
        (employeesApi.getAll as jest.Mock).mockResolvedValue({ data: { employees: [] } });
    });

    it('preserves and adds the selector-produced billed/free strings exactly', async () => {
        const { result } = renderHook(() => useSalesTransaction<Draft>({
            getInitialDocument: () => ({ items: [] }),
            documentType: 'challan',
            priceField: 'sale_price',
        }));
        await waitFor(() => expect(result.current.loadingEmployees).toBe(false));

        act(() => result.current.handleProductSelect(selectedProduct('0.375001', '0.125001')));
        expect(result.current.document.items[0]).toEqual(expect.objectContaining({
            quantity: '0.375001',
            free_quantity: '0.125001',
            unit_price: '9007199254740993.1250',
        }));

        act(() => result.current.handleProductSelect(selectedProduct('0.000001', '0.500000')));
        expect(result.current.document.items).toHaveLength(1);
        expect(result.current.document.items[0]).toEqual(expect.objectContaining({
            quantity: '0.375002',
            free_quantity: '0.625001',
        }));
    });

    it.each([
        ['missing billed', undefined, '0.000000'],
        ['missing free', '1.000000', undefined],
        ['numeric billed', 1, '0.000000'],
        ['numeric free', '1.000000', 0],
    ])('rejects %s quantity compatibility input', async (_label, quantity, freeQuantity) => {
        const { result } = renderHook(() => useSalesTransaction<Draft>({
            getInitialDocument: () => ({ items: [] }),
            documentType: 'challan',
            priceField: 'sale_price',
        }));
        await waitFor(() => expect(result.current.loadingEmployees).toBe(false));

        expect(() => result.current.handleProductSelect(selectedProduct(quantity, freeQuantity)))
            .toThrow(/exact billed and free decimal strings/);
        expect(result.current.document.items).toEqual([]);
    });

    it('normalizes edited quantity and rate strings without a Number conversion', async () => {
        const { result } = renderHook(() => useSalesTransaction<Draft>({
            getInitialDocument: () => ({ items: [] }),
            documentType: 'challan',
            priceField: 'sale_price',
        }));
        await waitFor(() => expect(result.current.loadingEmployees).toBe(false));
        act(() => result.current.handleProductSelect(selectedProduct('1.000000', '0.000000')));

        act(() => result.current.updateItem(0, 'quantity', '0.100001'));
        act(() => result.current.updateItem(0, 'free_quantity', '0.200002'));
        act(() => result.current.updateItem(0, 'unit_price', '9007199254740993.1250'));
        expect(result.current.document.items[0]).toEqual(expect.objectContaining({
            quantity: '0.100001',
            free_quantity: '0.200002',
            unit_price: '9007199254740993.1250',
        }));
    });
});
