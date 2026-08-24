import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BatchSelector from './BatchSelector';
import { batchesApi } from '../../../services/api';

jest.mock('../../../services/api', () => ({
    batchesApi: { getByProduct: jest.fn() },
}));

const canonicalBatch = (status: string, suffix: string) => ({
    batch_id: `d3000000-0000-7000-8000-0000000000${suffix}`,
    product_id: 'd3000000-0000-7000-8000-000000000015',
    location_id: 'd3000000-0000-7000-8000-000000000016',
    branch_id: 'd3000000-0000-7000-8000-000000000017',
    uom_conversion_id: 'd3000000-0000-7000-8000-000000000018',
    batch_number: `DEMO-${status.toUpperCase()}`,
    product_name: 'Demo Product',
    manufacturing_date: '2026-01-01',
    expiry_date: '2099-01-01',
    quantity_available: '12.000000',
    sale_price_per_unit: '100.0000',
    mrp_per_unit: '120.0000',
    cost_per_unit: '80.0000',
    gst_percent: '12.000000',
    batch_status: status,
    location_name: 'Saleable stock',
    branch_name: 'Mumbai',
});

const withExpiry = (status: string, suffix: string, expiryDate: string, batchNumber: string) => ({
    ...canonicalBatch(status, suffix),
    expiry_date: expiryDate,
    batch_number: batchNumber,
});

describe('BatchSelector lifecycle and mobile presentation', () => {
    it('disables blocked stock and exposes a full-width mobile action for released stock', async () => {
        (batchesApi.getByProduct as jest.Mock).mockResolvedValue({
            data: {
                batches: [
                    canonicalBatch('blocked', '19'),
                    canonicalBatch('released', '20'),
                ],
            },
        });

        render(
            <BatchSelector
                show
                product={{
                    product_id: 'd3000000-0000-7000-8000-000000000015',
                    product_name: 'Demo Product',
                } as any}
                onBatchSelect={jest.fn()}
                onClose={jest.fn()}
            />
        );

        const blocked = await screen.findByRole('option', {
            name: /DEMO-BLOCKED unavailable: Blocked by inventory or quality control/i,
        });
        expect((blocked as HTMLButtonElement).disabled).toBe(true);
        expect(within(blocked).getByText('Blocked by inventory or quality control')).toBeTruthy();

        const released = screen.getByRole('option', { name: /Select batch DEMO-RELEASED/i });
        expect((released as HTMLButtonElement).disabled).toBe(false);
        expect(within(released).getByText('Select this batch').className).toContain('w-full');
        expect(within(released).getByText('MRP')).toBeTruthy();

        await waitFor(() => expect(batchesApi.getByProduct).toHaveBeenCalledTimes(1));
    });

    it('recommends one earliest-expiry lot, permits its expiry tier, and blocks later expiry', async () => {
        const onBatchSelect = jest.fn();
        (batchesApi.getByProduct as jest.Mock).mockResolvedValue({
            data: {
                batches: [
                    withExpiry('released', '23', '2099-10-01', 'LATER'),
                    withExpiry('released', '22', '2099-09-01', 'SAME-EXPIRY'),
                    withExpiry('released', '21', '2099-09-01', 'EARLIEST'),
                ],
            },
        });

        render(
            <BatchSelector
                show
                enforceFefo
                product={{
                    product_id: 'd3000000-0000-7000-8000-000000000015',
                    product_name: 'Demo Product',
                } as any}
                onBatchSelect={onBatchSelect}
                onClose={jest.fn()}
            />
        );

        const earliest = await screen.findByRole('option', { name: /Select batch EARLIEST/i });
        const sameExpiry = screen.getByRole('option', { name: /Select batch SAME-EXPIRY/i });
        const later = screen.getByRole('option', {
            name: /LATER unavailable: FEFO requires batch EARLIEST \(expires 2099-09-01\) first/i,
        });

        expect((earliest as HTMLButtonElement).disabled).toBe(false);
        expect(earliest.getAttribute('aria-selected')).toBe('true');
        expect(within(earliest).getByText('Recommended FEFO batch')).toBeTruthy();
        expect((sameExpiry as HTMLButtonElement).disabled).toBe(false);
        expect((later as HTMLButtonElement).disabled).toBe(true);
        expect(within(later).getByText(/FEFO requires batch EARLIEST/i)).toBeTruthy();

        fireEvent.click(sameExpiry);
        await waitFor(() => expect(onBatchSelect).toHaveBeenCalledTimes(1));
        expect(onBatchSelect.mock.calls[0][0]).toMatchObject({ batch_number: 'SAME-EXPIRY' });
        expect(onBatchSelect.mock.calls[0][0]).toMatchObject({
            quantity: '1.000000',
            free_quantity: '0.000000',
            unit_price: '100.0000',
            available_quantity: '12.000000',
        });
    });

    it('renders and returns large and fractional canonical decimals without coercion', async () => {
        const onBatchSelect = jest.fn();
        (batchesApi.getByProduct as jest.Mock).mockResolvedValue({
            data: { batches: [{
                ...canonicalBatch('released', '24'),
                quantity_available: '0.123456',
                sale_price_per_unit: '9007199254740993.1250',
                mrp_per_unit: '9007199254740993.2500',
            }] },
        });
        render(<BatchSelector show enforceFefo product={{
            product_id: 'd3000000-0000-7000-8000-000000000015',
            product_name: 'Demo Product',
            product_code: 'DEMO',
            product_type: 'medicine',
            gst_percent: '12.000000',
        } as any} onBatchSelect={onBatchSelect} onClose={jest.fn()} />);

        const option = await screen.findByRole('option', { name: /Select batch DEMO-RELEASED/i });
        expect(within(option).getAllByText('₹9007199254740993.125').length).toBeGreaterThan(0);
        fireEvent.click(option);
        await waitFor(() => expect(onBatchSelect).toHaveBeenCalledTimes(1));
        expect(onBatchSelect.mock.calls[0][0]).toMatchObject({
            available_quantity: '0.123456',
            unit_price: '9007199254740993.1250',
            mrp: '9007199254740993.2500',
        });
    });

    it('rejects numeric API decimals instead of silently rounding them', async () => {
        (batchesApi.getByProduct as jest.Mock).mockResolvedValue({
            data: { batches: [{ ...canonicalBatch('released', '25'), quantity_available: 0.1 }] },
        });
        render(<BatchSelector show product={{
            product_id: 'd3000000-0000-7000-8000-000000000015',
            product_name: 'Demo Product',
            product_code: 'DEMO',
            product_type: 'medicine',
        } as any} onBatchSelect={jest.fn()} onClose={jest.fn()} />);

        expect(await screen.findByText(/must remain an exact decimal string/i)).toBeTruthy();
        expect(screen.queryByRole('option')).toBeNull();
    });
});
