import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AddressForm, { validateCustomerAddress } from './AddressForm';
import { apiClient } from '../../../services/api';

jest.mock('../../../services/api', () => ({
    apiClient: { get: jest.fn() },
    customersApi: {},
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
});
