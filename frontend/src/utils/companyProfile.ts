import type { CompanyContextInfo } from '../types/common/company.types';

const ownValue = (source: Record<string, any>, keys: string[], fallback = ''): string => {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            const value = source[key];
            if (Array.isArray(value)) return String(value.find(Boolean) ?? '');
            return String(value ?? '');
        }
    }
    return fallback;
};

/** Normalize the canonical organization projection without hiding missing live facts behind stale cache. */
export function normalizeCompanyProfile(
    profile: Record<string, any>,
    cached: CompanyContextInfo,
): CompanyContextInfo | null {
    const name = ownValue(
        profile,
        ['name', 'company_name', 'legal_name', 'org_name', 'trade_name'],
        cached.name,
    ).trim();
    if (!name) return null;

    const licenceText = Object.prototype.hasOwnProperty.call(profile, 'licenses')
        ? (profile.licenses || []).map((license: Record<string, any>) =>
            `${license.license_type_code}: ${license.license_number}`,
        ).join(' / ')
        : ownValue(
            profile,
            ['drug_license_number', 'drug_license'],
            cached.drug_license_number,
        );

    return {
        name,
        address: ownValue(profile, ['address', 'registered_address'], cached.address),
        city: ownValue(profile, ['city', 'registered_city'], cached.city),
        state: ownValue(profile, ['state', 'state_code', 'registered_state_code'], cached.state),
        pincode: ownValue(profile, ['pincode', 'postal_code', 'registered_postal_code'], cached.pincode),
        phone: ownValue(profile, ['phone', 'contact_numbers'], cached.phone),
        email: ownValue(profile, ['email', 'email_addresses'], cached.email),
        gst_number: ownValue(profile, ['gst_number', 'gstin'], cached.gst_number),
        pan_number: ownValue(profile, ['pan_number', 'pan'], cached.pan_number),
        drug_license_number: licenceText,
        fssai_number: ownValue(profile, ['fssai_number'], cached.fssai_number),
        msme_number: ownValue(profile, ['msme_number'], cached.msme_number),
        logo: profile.logo ?? profile.logo_url ?? cached.logo,
        bankAccounts: Object.prototype.hasOwnProperty.call(profile, 'bank_accounts')
            ? (profile.bank_accounts || [])
            : cached.bankAccounts,
        paymentQR: profile.payment_qr_code ?? cached.paymentQR,
        business_settings: profile.business_settings ?? cached.business_settings ?? {},
    };
}
