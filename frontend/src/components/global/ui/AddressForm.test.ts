import { validateCustomerAddress } from './AddressForm';

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
