import React, { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { Order } from '../../../../types/models';
import { ordersApi } from '../../../../services/api/modules/sales/orders.api';
import type { CanonicalDocumentPolicy } from '../../../../services/api/modules/org/canonicalBusinessContext.api';
import { useSalesOrderSave } from './useSalesOrderSave';

jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));
jest.mock('../../../../utils/clientUuid', () => ({
    clientUuid: () => '10000000-0000-7000-8000-000000000099',
}));
jest.mock('../../../../services/api/modules/sales/orders.api', () => ({
    ordersApi: {
        prepareCanonical: jest.fn(),
        executePreparedCanonical: jest.fn(),
        getCanonical: jest.fn(),
    },
}));

const ids = {
    address: '10000000-0000-7000-8000-000000000001',
    branch: '10000000-0000-7000-8000-000000000002',
    customer: '10000000-0000-7000-8000-000000000003',
    product: '10000000-0000-7000-8000-000000000004',
    uom: '10000000-0000-7000-8000-000000000005',
};

const policy: CanonicalDocumentPolicy = {
    allowed_rounding_policies: ['none'],
    default_rounding_policy: 'none',
    allowed_zero_rated_payment_modes: ['not_applicable', 'with_igst'],
    default_zero_rated_payment_mode: 'not_applicable',
    allowed_tax_charge_mechanisms: ['normal'],
    default_tax_charge_mechanism: 'normal',
    allowed_price_bases: ['tax_exclusive'],
    default_price_basis: 'tax_exclusive',
    logistics_modes: [{
        transport_mode: 'in_person',
        display_name: 'In person',
        requires_transporter_party: false,
        requires_vehicle: false,
        requires_transport_document: false,
    }],
    default_transport_mode: 'in_person',
};

const validOrder = (): Order => ({
    order_date: '2026-08-27',
    expected_delivery_date: '2026-08-29',
    customer_id: ids.customer,
    shipping_address_data: { address_id: ids.address, row_version: '7' },
    discount_amount: '0.00',
    delivery_charges: '0.00',
    other_charges: '0.00',
    items: [{
        branch_id: ids.branch,
        product_id: ids.product,
        uom_conversion_id: ids.uom,
        quantity: '2.000000',
        free_quantity: '0.000000',
        free_supply_tax_treatment: 'excluded_from_taxable_value',
        unit_price: '84.1250',
        discount_percent: '0.000000',
    }],
} as Order);

function PrepareHarness({ order }: { order: Order }) {
    const [message, setMessage] = useState('');
    const [messageType, setMessageType] = useState('');
    const save = useSalesOrderSave({
        order,
        selectedCustomer: { customer_id: ids.customer },
        documentPolicy: policy,
        setOrder: jest.fn(),
        setCreatedOrderData: jest.fn(),
        setShowSuccessModal: jest.fn(),
        setMessage,
        setMessageType,
    });
    return <>
        <button type="button" onClick={() => void save.handleSaveOrder()}>Generate Order</button>
        {message && <div role="alert" data-message-type={messageType}>{message}</div>}
    </>;
}

describe('sales-order visible prepare action', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (ordersApi.prepareCanonical as jest.Mock).mockResolvedValue({
            data: {
                command_request_id: '10000000-0000-7000-8000-000000000006',
                preview_hash: `sha256:${'a'.repeat(64)}`,
            },
        });
    });

    it('clicking Generate Order dispatches the canonical prepare payload', async () => {
        render(<PrepareHarness order={validOrder()} />);

        await userEvent.click(screen.getByRole('button', { name: 'Generate Order' }));

        await waitFor(() => expect(ordersApi.prepareCanonical).toHaveBeenCalledTimes(1));
        expect(ordersApi.prepareCanonical).toHaveBeenCalledWith(expect.objectContaining({
            branch_id: ids.branch,
            customer_account_id: ids.customer,
            delivery_address_id: ids.address,
            delivery_address_row_version: '7',
            order_date: '2026-08-27',
            requested_delivery_date: '2026-08-29',
            lines: [expect.objectContaining({
                product_id: ids.product,
                uom_conversion_id: ids.uom,
                billed_quantity: '2.000000',
                quoted_unit_rate: '84.1250',
            })],
        }));
    });

    it('keeps local canonical validation visible and does not emit a prepare', async () => {
        const order = validOrder();
        order.items[0].quantity = '0';
        render(<PrepareHarness order={order} />);

        await userEvent.click(screen.getByRole('button', { name: 'Generate Order' }));

        const alert = await screen.findByRole('alert');
        expect(alert.textContent).toBe('Item 1 billed quantity must be greater than zero');
        expect(alert.getAttribute('data-message-type')).toBe('error');
        expect(ordersApi.prepareCanonical).not.toHaveBeenCalled();
    });
});
