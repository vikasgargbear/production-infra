import { normalizeCompanyProfile, unwrapCompanyProfileResponse } from './companyProfile';

describe('normalizeCompanyProfile', () => {
    it('unwraps the Axios and canonical success envelopes exactly once', () => {
        const profile = { legal_name: 'Canonical Pharma Private Limited' };
        expect(unwrapCompanyProfileResponse({ data: { success: true, data: profile } })).toBe(profile);
        expect(unwrapCompanyProfileResponse({ success: true, data: profile })).toBe(profile);
        expect(unwrapCompanyProfileResponse(profile)).toBe(profile);
    });

    it('maps canonical organization, contact, registration, licence, and bank fields', () => {
        const result = normalizeCompanyProfile({
            org_name: 'Canonical Pharma Private Limited',
            registered_address: '1 Canonical Road',
            city: 'Mumbai', state: '27', pincode: '400001',
            contact_numbers: ['9000000000'], email_addresses: ['ops@example.invalid'],
            gst_number: '27ABCDE1234F1Z5',
            licenses: [{ license_type_code: 'drug_wholesale_form_20b', license_number: 'DL-20B' }],
            bank_accounts: [{ id: 'bank-1', bank_name: 'Demo Bank', ifsc_code: 'HDFC0000001' }],
        });

        expect(result).toEqual(expect.objectContaining({
            name: 'Canonical Pharma Private Limited',
            address: '1 Canonical Road',
            state: 'Maharashtra',
            phone: '9000000000',
            email: 'ops@example.invalid',
            gst_number: '27ABCDE1234F1Z5',
            drug_license_number: 'drug_wholesale_form_20b: DL-20B',
        }));
        expect(result?.bankAccounts[0].bank_name).toBe('Demo Bank');
    });

    it('does not hide missing authoritative mandatory fields behind stale cache', () => {
        const result = normalizeCompanyProfile({
            legal_name: 'Canonical Pharma Private Limited',
            registered_address: null,
            gst_number: null,
            licenses: [],
            bank_accounts: [],
        });

        expect(result?.address).toBe('');
        expect(result?.gst_number).toBe('');
    });

    it('rejects malformed canonical collections instead of inventing defaults', () => {
        expect(normalizeCompanyProfile({ legal_name: 'Canonical Pharma Private Limited' })).toBeNull();
    });
});
