import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    quantity_available: 12,
    sale_price_per_unit: 100,
    mrp_per_unit: 120,
    cost_per_unit: 80,
    gst_percent: 12,
    batch_status: status,
    location_name: 'Saleable stock',
    branch_name: 'Mumbai',
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
});
