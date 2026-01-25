/**
 * AddressInput Component
 * 
 * A simple, reusable address input form for both Customer and Supplier creation.
 * Provides consistent UX and data structure across the application.
 * 
 * Usage:
 * <AddressInput
 *   value={{ address_line1: '', city: '', state: '', pincode: '' }}
 *   onChange={(address) => setAddress(address)}
 * />
 */

import React from 'react';

// ==================== TYPE DEFINITIONS ====================

export interface AddressData {
    address_line1: string;
    address_line2?: string;
    landmark?: string;
    city: string;
    state: string;
    pincode: string;
    country?: string;
}

export interface AddressInputProps {
    /** Current address values */
    value: Partial<AddressData>;
    /** Callback when any field changes */
    onChange: (address: AddressData) => void;
    /** Show landmark field */
    showLandmark?: boolean;
    /** CSS class for container */
    className?: string;
    /** Custom input class override */
    inputClassName?: string;
    /** Disabled state */
    disabled?: boolean;
    /** Which fields are required (default: address_line1, city, state, pincode) */
    required?: ('address_line1' | 'city' | 'state' | 'pincode')[];
    /** Label text customization */
    labels?: Partial<Record<keyof AddressData, string>>;
}

// ==================== CONSTANTS ====================

const INDIAN_STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
    'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
    'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
    'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
    'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'
];

// ==================== COMPONENT ====================

const AddressInput: React.FC<AddressInputProps> = ({
    value,
    onChange,
    showLandmark = false,
    className = '',
    inputClassName = '',
    disabled = false,
    required = ['address_line1', 'city', 'state', 'pincode'],
    labels = {}
}) => {
    // Merge with defaults
    const addressData: AddressData = {
        address_line1: value.address_line1 || '',
        address_line2: value.address_line2 || '',
        landmark: value.landmark || '',
        city: value.city || '',
        state: value.state || '',
        pincode: value.pincode || '',
        country: value.country || 'India'
    };

    const handleChange = (field: keyof AddressData, fieldValue: string) => {
        onChange({
            ...addressData,
            [field]: fieldValue
        });
    };

    const isRequired = (field: keyof AddressData) => required.includes(field as any);
    const getLabel = (field: keyof AddressData, defaultLabel: string) => {
        const label = labels[field] || defaultLabel;
        return isRequired(field) ? `${label} *` : label;
    };

    // Standard input styling
    const baseInputClass = inputClassName || "w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm";
    const labelClass = "block text-xs font-medium text-gray-600 mb-1";

    return (
        <div className={`space-y-3 ${className}`}>
            {/* Row 1: Address Line 1 */}
            <div>
                <label className={labelClass}>{getLabel('address_line1', 'Address Line 1')}</label>
                <input
                    type="text"
                    value={addressData.address_line1}
                    onChange={(e) => handleChange('address_line1', e.target.value)}
                    className={baseInputClass}
                    placeholder="Building, street address"
                    disabled={disabled}
                />
            </div>

            {/* Row 2: Address Line 2 + Landmark (optional) */}
            <div className={`grid gap-3 ${showLandmark ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <div>
                    <label className={labelClass}>{getLabel('address_line2', 'Address Line 2')}</label>
                    <input
                        type="text"
                        value={addressData.address_line2}
                        onChange={(e) => handleChange('address_line2', e.target.value)}
                        className={baseInputClass}
                        placeholder="Area / Additional address"
                        disabled={disabled}
                    />
                </div>
                {showLandmark && (
                    <div>
                        <label className={labelClass}>{getLabel('landmark', 'Landmark')}</label>
                        <input
                            type="text"
                            value={addressData.landmark}
                            onChange={(e) => handleChange('landmark', e.target.value)}
                            className={baseInputClass}
                            placeholder="Near / Opposite to"
                            disabled={disabled}
                        />
                    </div>
                )}
            </div>

            {/* Row 3: City, State, Pincode */}
            <div className="grid grid-cols-3 gap-3">
                <div>
                    <label className={labelClass}>{getLabel('city', 'City')}</label>
                    <input
                        type="text"
                        value={addressData.city}
                        onChange={(e) => handleChange('city', e.target.value)}
                        className={baseInputClass}
                        placeholder="City"
                        disabled={disabled}
                    />
                </div>
                <div>
                    <label className={labelClass}>{getLabel('state', 'State')}</label>
                    <select
                        value={addressData.state}
                        onChange={(e) => handleChange('state', e.target.value)}
                        className={baseInputClass}
                        disabled={disabled}
                    >
                        <option value="">Select State</option>
                        {INDIAN_STATES.map(state => (
                            <option key={state} value={state}>{state}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={labelClass}>{getLabel('pincode', 'Pincode')}</label>
                    <input
                        type="text"
                        value={addressData.pincode}
                        onChange={(e) => handleChange('pincode', e.target.value)}
                        className={baseInputClass}
                        placeholder="6-digit"
                        maxLength={6}
                        disabled={disabled}
                    />
                </div>
            </div>
        </div>
    );
};

export default AddressInput;
