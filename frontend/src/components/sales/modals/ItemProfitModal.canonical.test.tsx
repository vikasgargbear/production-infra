import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ItemProfitModal from './ItemProfitModal';
import { batchesApi } from '../../../services/api';

jest.mock('../../../services/api', () => ({
    batchesApi: { getByProduct: jest.fn() },
}));

jest.mock('../../../hooks/useEscapeKey', () => ({
    __esModule: true,
    default: jest.fn(),
}));

const productId = 'd3000000-0000-7000-8000-000000000015';
const batchId = 'd3000000-0000-7000-8000-000000000019';

const line = {
    product_id: productId,
    batch_id: batchId,
    product_name: 'Canonical Product',
    batch_number: 'CANONICAL-BATCH',
    quantity: '2.000000',
    unit_price: '100.0000',
    discount_amount: '0.00',
};

describe('ItemProfitModal canonical inventory cost boundary', () => {
    beforeEach(() => jest.clearAllMocks());

    it('loads the selected batch cost through the UUID product projection', async () => {
        (batchesApi.getByProduct as jest.Mock).mockResolvedValue({
            data: { batches: [{ batch_id: batchId, product_id: productId, cost_per_unit: '60.0000' }] },
        });

        render(<ItemProfitModal isOpen onClose={jest.fn()} items={[line]} />);

        await waitFor(() => expect(batchesApi.getByProduct).toHaveBeenCalledWith(productId));
        expect((await screen.findAllByText('₹120.00')).length).toBeGreaterThan(0);
        expect(screen.getAllByText('₹80.00').length).toBeGreaterThan(0);
    });

    it('fails closed when the canonical batch has no authoritative cost', async () => {
        (batchesApi.getByProduct as jest.Mock).mockResolvedValue({
            data: { batches: [{ batch_id: batchId, product_id: productId, cost_per_unit: null }] },
        });

        render(<ItemProfitModal isOpen onClose={jest.fn()} items={[line]} />);

        expect(await screen.findByRole('alert')).toHaveTextContent(
            /profit analysis is unavailable until authoritative batch cost is present/i,
        );
        expect(screen.queryByText('₹0.00')).not.toBeInTheDocument();
    });
});
