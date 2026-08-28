import { validateSupplierMandatoryFields } from './supplierValidation';

const validSupplier = {
    supplier_name: 'Canonical Supplier',
    phone: '9876543210',
    address_line1: '101 Test Lane',
    city: 'Mumbai',
    state_code: '27',
    pincode: '400001',
};

describe('supplier creation client contract', () => {
    it('accepts the complete canonical contact and address facts', () => {
        expect(validateSupplierMandatoryFields(validSupplier)).toEqual([]);
        expect(validateSupplierMandatoryFields({
            ...validSupplier,
            phone: '+91 98765 43210',
        })).toEqual([]);
    });

    it('requires every address fact before making an API request', () => {
        expect(validateSupplierMandatoryFields({
            ...validSupplier,
            address_line1: '', city: '', state_code: '', pincode: '',
        })).toEqual([
            'Building / street address is required',
            'City is required',
            'GST state code must contain exactly 2 digits',
            'Pincode is required',
        ]);
    });

    it('rejects a GSTIN whose prefix differs from the address state code', () => {
        expect(validateSupplierMandatoryFields({
            ...validSupplier,
            gst_number: '29AAPFU0939F1ZV',
        })).toEqual([
            'GSTIN state code must match the address GST state code',
        ]);
    });

    it('rejects malformed phone and pincode values locally', () => {
        expect(validateSupplierMandatoryFields({
            ...validSupplier,
            phone: '123',
            pincode: '4000',
        })).toEqual([
            'Phone number must be a valid 10-digit Indian mobile number',
            'Pincode must be exactly 6 digits',
        ]);
    });
});
