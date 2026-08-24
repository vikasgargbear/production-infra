import { normalizeCompanyProfile } from './companyProfile';
import type { CompanyContextInfo } from '../types/common/company.types';

const cached = {
    name: 'Stale Company', address: 'Stale address', city: '', state: '', pincode: '',
    phone: '', email: '', gst_number: '27AAAAA0000A1Z5', pan_number: '',
    drug_license_number: '', fssai_number: '', msme_number: '', logo: null,
    bankAccounts: [], paymentQR: null,
} as CompanyContextInfo;

describe('normalizeCompanyProfile', () => {
    it('maps canonical organization, contact, registration, licence, and bank fields', () => {
        const result = normalizeCompanyProfile({
            org_name: 'Canonical Pharma Private Limited',
            registered_address: '1 Canonical Road',
            city: 'Mumbai', state: '27', pincode: '400001',
            contact_numbers: ['9000000000'], email_addresses: ['ops@example.invalid'],
            gst_number: '27ABCDE1234F1Z5',
            licenses: [{ license_type_code: 'drug_wholesale_form_20b', license_number: 'DL-20B' }],
            bank_accounts: [{ id: 'bank-1', bank_name: 'Demo Bank', ifsc_code: 'HDFC0000001' }],
        }, cached);

        expect(result).toEqual(expect.objectContaining({
            name: 'Canonical Pharma Private Limited',
            address: '1 Canonical Road',
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
        }, cached);

        expect(result?.address).toBe('');
        expect(result?.gst_number).toBe('');
    });
});
