import type { BankAccount, CompanyContextInfo } from '../types/common/company.types';

export function unwrapCompanyProfileResponse(response: any): Record<string, any> | null {
    const transport = response?.data ?? response;
    const profile = transport?.success && transport?.data
        ? transport.data
        : transport;
    return profile && typeof profile === 'object' ? profile : null;
}

const textValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    return typeof value === 'string' ? value : '';
};

const firstText = (value: unknown): string => (
    Array.isArray(value) ? textValue(value.find(item => typeof item === 'string')) : ''
);

/** Decode only the canonical organization projection; no cache or legacy aliases. */
export function normalizeCompanyProfile(
    profile: Record<string, any>,
): CompanyContextInfo | null {
    const name = textValue(profile.legal_name || profile.org_name).trim();
    if (!name) return null;

    if (!Array.isArray(profile.licenses) || !Array.isArray(profile.bank_accounts)) {
        return null;
    }

    const licenceText = profile.licenses
        .filter((license: unknown) => license && typeof license === 'object')
        .map((license: Record<string, any>) =>
            `${license.license_type_code}: ${license.license_number}`,
        ).join(' / ');

    const bankAccounts = profile.bank_accounts.filter(
        (account: unknown): account is BankAccount => Boolean(
            account && typeof account === 'object'
            && typeof (account as BankAccount).bank_name === 'string'
            && typeof (account as BankAccount).ifsc_code === 'string',
        ),
    );
    const stateCode = textValue(profile.state_code || profile.state).trim();

    return {
        name,
        address: textValue(profile.registered_address),
        city: textValue(profile.city),
        state: /^\d{2}$/.test(stateCode) ? stateCode : '',
        pincode: textValue(profile.pincode),
        phone: firstText(profile.contact_numbers),
        email: firstText(profile.email_addresses),
        gst_number: textValue(profile.gst_number),
        pan_number: textValue(profile.pan_number),
        drug_license_number: licenceText,
        fssai_number: '',
        msme_number: '',
        logo: null,
        bankAccounts,
        paymentQR: null,
        business_settings: {},
    };
}
