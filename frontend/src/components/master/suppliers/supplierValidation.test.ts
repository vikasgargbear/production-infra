import { validateSupplierMandatoryFields } from './supplierValidation';

const validSupplier = {
    supplier_name: 'Canonical Supplier',
    phone: '9876543210',
    address_line1: '101 Test Lane',
    city: 'Mumbai',
    state: 'Maharashtra',
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
            address_line1: '', city: '', state: '', pincode: '',
        })).toEqual([
            'Building / street address is required',
            'City is required',
            'State is required',
            'Pincode is required',
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
