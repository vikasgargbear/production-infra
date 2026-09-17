import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AddressForm, { validateCustomerAddress } from './AddressForm';
import { apiClient } from '../../../services/api';

jest.mock('../../../services/api', () => ({
    apiClient: { get: jest.fn() },
    customersApi: {},
}));

jest.mock('../../../services/api/modules/master/gstJurisdictions.api', () => ({
    gstJurisdictionsApi: { list: () => Promise.resolve({ data: [] }) },
}));

describe('validateCustomerAddress', () => {
    it('rejects a blank address before persistence', () => {
        expect(validateCustomerAddress({})).toEqual({
            address_line1: 'Address line 1 is required',
            city: 'City is required',
            state: 'Enter the 2-digit GST state code',
            pincode: 'Enter a valid 6-digit pincode',
        });
    });

    it('rejects malformed Indian pincodes', () => {
        expect(validateCustomerAddress({
            address_line1: '202 Synthetic Retail Lane',
            city: 'Mumbai',
            state: '27',
            pincode: '4000A1',
        })).toEqual({ pincode: 'Enter a valid 6-digit pincode' });
    });

    it('accepts all required canonical address fields', () => {
        expect(validateCustomerAddress({
            address_line1: '202 Synthetic Retail Lane',
            city: 'Mumbai',
            state: '27',
            pincode: '400001',
        })).toEqual({});
    });

    it('rejects a display name in place of the canonical state code', () => {
        expect(validateCustomerAddress({
            address_line1: '202 Synthetic Retail Lane',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
        })).toEqual({ state: 'Enter the 2-digit GST state code' });
    });
});

describe('AddressForm canonical delivery selection', () => {
    it('edits the chosen address with its own default flag and correctly labelled city', async () => {
        (apiClient.get as jest.Mock).mockResolvedValue({ data: { success: true, data: [
            { address_id: 'd3000000-0000-7000-8000-000000000041', row_version: 1,
                address_type: 'shipping', address_line1: 'Primary road', address_line2: 'Primary area',
                city: 'Mumbai', state_code: '27', pincode: '400001', is_default: true },
            { address_id: 'd3000000-0000-7000-8000-000000000042', row_version: 2,
                address_type: 'shipping', address_line1: 'Other road', address_line2: 'Other area',
                city: 'Pune', state_code: '27', pincode: '411001', is_default: false },
        ] } });
        render(<AddressForm addressType="shipping" customer={{
            customer_id: 'd3000000-0000-7000-8000-000000000011', customer_name: 'Canonical Customer',
        }} />);
        await screen.findByText('Primary road, Primary area, Mumbai, 27');
        fireEvent.click(screen.getByRole('button', { name: 'Change' }));
        await act(async () => { fireEvent.click(screen.getAllByTitle('Edit this address')[1]); });
        expect((screen.getByLabelText('Default address') as HTMLInputElement).checked).toBe(false);
        expect((screen.getByLabelText('City') as HTMLInputElement).value).toBe('Pune');
        expect((screen.getByLabelText('Address line 2') as HTMLInputElement).value).toBe('Other area');
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(screen.getByRole('button', { name: 'Change' }));
        await act(async () => { fireEvent.click(screen.getAllByTitle('Edit this address')[0]); });
        expect((screen.getByLabelText('Default address') as HTMLInputElement).checked).toBe(true);
    });

    it('keeps the primary billing row selectable as an exact delivery UUID and row version', async () => {
        (apiClient.get as jest.Mock).mockResolvedValue({
            data: {
                success: true,
                data: [{
                    address_id: 'd3000000-0000-7000-8000-000000000041',
                    row_version: 7,
                    address_type: 'billing',
                    address_line1: '202 Synthetic Retail Lane',
                    city: 'Mumbai',
                    state_code: '27',
                    pincode: '400002',
                    country_code: 'IN',
                    is_default: true,
                }],
            },
        });
        const onSave = jest.fn();
        render(
            <AddressForm
                addressType="shipping"
                customer={{
                    customer_id: 'd3000000-0000-7000-8000-000000000011',
                    customer_name: 'Canonical Customer',
                }}
                onSave={onSave}
            />,
        );

        await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
            address_id: 'd3000000-0000-7000-8000-000000000041',
            row_version: 7,
        })));
        fireEvent.click(screen.getByRole('button', { name: 'Change' }));
        expect(await screen.findByTestId(
            'select-address-d3000000-0000-7000-8000-000000000041-v7',
        )).toBeTruthy();
    });

    it('keeps an address menu open when default hydration finishes after Change', async () => {
        let resolveAddresses!: (response: unknown) => void;
        (apiClient.get as jest.Mock).mockReturnValue(new Promise(resolve => {
            resolveAddresses = resolve;
        }));

        render(
            <AddressForm
                addressType="shipping"
                customer={{
                    customer_id: 'd3000000-0000-7000-8000-000000000011',
                    customer_name: 'Canonical Customer',
                }}
                onSave={jest.fn()}
            />,
        );

        await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith(
            '/customers/d3000000-0000-7000-8000-000000000011/addresses',
        ));
        fireEvent.click(screen.getByRole('button', { name: 'Change' }));
        expect(screen.getByText('Loading addresses...')).toBeTruthy();

        await act(async () => {
            resolveAddresses({
                data: {
                    success: true,
                    data: [{
                        address_id: 'd3000000-0000-7000-8000-000000000041',
                        row_version: 7,
                        address_type: 'billing',
                        address_line1: '202 Synthetic Retail Lane',
                        city: 'Mumbai',
                        state_code: '27',
                        pincode: '400002',
                        country_code: 'IN',
                        is_default: true,
                    }],
                },
            });
        });

        expect(await screen.findByTestId(
            'select-address-d3000000-0000-7000-8000-000000000041-v7',
        )).toBeTruthy();
    });
});
