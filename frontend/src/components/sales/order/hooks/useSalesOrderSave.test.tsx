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
    document_discount_amount: '0.00',
    discount_amount: '17.25',
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
        businessDate: '2026-08-27',
        setOrder: jest.fn(),
        setCreatedOrderData: jest.fn(),
        setShowSuccessModal: jest.fn(),
        setMessage,
        setMessageType,
    });
    return <>
        <button type="button" onClick={() => void save.handleSaveOrder()}>Generate Order</button>
        {save.reviewOpen && (
            <button type="button" onClick={() => void save.confirmPreparedOrder()}>
                Confirm Order
            </button>
        )}
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
        (ordersApi.executePreparedCanonical as jest.Mock).mockResolvedValue({
            data: { resource_id: '10000000-0000-7000-8000-000000000007' },
        });
        (ordersApi.getCanonical as jest.Mock).mockResolvedValue({
            data: {
                sales_order_id: '10000000-0000-7000-8000-000000000007',
                order_number: 'SO-000001',
                customer_name: 'Canonical Customer',
                requested_delivery_date: '2026-08-29',
                total_amount: '168.25',
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

    it('does not mistake the calculated line-discount total for a document discount', async () => {
        const order = validOrder();
        order.items[0].discount_percent = '10.000000';
        order.discount_amount = '17.25';
        render(<PrepareHarness order={order} />);

        await userEvent.click(screen.getByRole('button', { name: 'Generate Order' }));

        await waitFor(() => expect(ordersApi.prepareCanonical).toHaveBeenCalledTimes(1));
        expect(ordersApi.prepareCanonical).toHaveBeenCalledWith(expect.objectContaining({
            document_discount: expect.objectContaining({
                document_discount_kind: 'none',
                document_discount_value: '0',
            }),
            lines: [expect.objectContaining({
                line_discount: {
                    line_discount_kind: 'percent',
                    line_discount_basis: 'taxable_value',
                    line_discount_value: '10.000000',
                },
            })],
        }));
    });

    it('fails closed if an unsupported document discount is explicitly introduced', async () => {
        const order = validOrder();
        order.document_discount_amount = '1.00';
        render(<PrepareHarness order={order} />);

        await userEvent.click(screen.getByRole('button', { name: 'Generate Order' }));

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Order document discount is not supported by canonical sales-order posting',
        );
        expect(ordersApi.prepareCanonical).not.toHaveBeenCalled();
    });

    it('verifies the exact requested delivery date in authoritative readback', async () => {
        render(<PrepareHarness order={validOrder()} />);

        await userEvent.click(screen.getByRole('button', { name: 'Generate Order' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Confirm Order' }));

        await waitFor(() => expect(ordersApi.getCanonical).toHaveBeenCalledWith(
            '10000000-0000-7000-8000-000000000007',
        ));
        expect((await screen.findByRole('alert')).textContent).toBe(
            'Sales order posted and verified from the canonical API.',
        );
    });

    it('fails closed when authoritative readback changes the requested delivery date', async () => {
        (ordersApi.getCanonical as jest.Mock).mockResolvedValue({
            data: {
                sales_order_id: '10000000-0000-7000-8000-000000000007',
                order_number: 'SO-000001',
                customer_name: 'Canonical Customer',
                requested_delivery_date: '2026-08-30',
                total_amount: '168.25',
            },
        });
        render(<PrepareHarness order={validOrder()} />);

        await userEvent.click(screen.getByRole('button', { name: 'Generate Order' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Confirm Order' }));

        expect((await screen.findByRole('alert')).textContent).toBe(
            'Order posted, but the requested delivery date differs from authoritative readback.',
        );
    });
});
