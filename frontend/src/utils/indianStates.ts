export const INDIAN_STATES = [
    ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'],
    ['04', 'Chandigarh'], ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'],
    ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'],
    ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'],
    ['16', 'Tripura'], ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'],
    ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'],
    ['24', 'Gujarat'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'],
    ['27', 'Maharashtra'], ['28', 'Andhra Pradesh'], ['29', 'Karnataka'], ['30', 'Goa'],
    ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
    ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'],
    ['37', 'Andhra Pradesh (New)'], ['38', 'Ladakh'],
] as const;

export const indianStateName = (value?: string | null): string => {
    if (!value) return '';
    return INDIAN_STATES.find(([code]) => code === value)?.[1] || value;
};

/** Resolve either a GST state code or a displayed Indian state name to its code. */
export const indianStateCode = (value?: string | null): string => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (/^\d{2}$/.test(normalized)) return normalized;
    return INDIAN_STATES.find(([, name]) =>
        name.localeCompare(normalized, undefined, { sensitivity: 'base' }) === 0
    )?.[0] || '';
};
