import React, { useState, useEffect, ChangeEvent } from 'react';
import { MapPin, Edit2, Check, X } from 'lucide-react';

// ==================== TYPE DEFINITIONS ====================

// Imports from centralized types
import type { Customer } from '../../sales/invoice/types/invoiceTypes';

// ==================== TYPE DEFINITIONS ====================

interface AddressOption {
    id: string;
    label: string;
    value: string;
    isDefault?: boolean;
}

export interface AddressSelectorProps {
    customer?: Customer | null;
    currentAddress?: string;
    addressType?: 'billing' | 'shipping';
    onChange: (address: string) => void;
    onSave?: (address: string) => void;
    sameAsBilling?: boolean;
    onSameAsBillingChange?: (sameAsBilling: boolean) => void;
    className?: string;
}

// ==================== COMPONENT ====================

/**
 * Address Selector Component
 * Allows users to select, edit, or add addresses
 */
const AddressSelector: React.FC<AddressSelectorProps> = ({
    customer,
    currentAddress,
    addressType = 'billing',
    onChange,
    onSave,
    sameAsBilling = false,
    onSameAsBillingChange,
    className = ''
}) => {
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [editableAddress, setEditableAddress] = useState<string>('');
    const [addresses, setAddresses] = useState<AddressOption[]>([]);
    const [localAddress, setLocalAddress] = useState<string>(currentAddress || '');

    useEffect(() => {
        if (customer) {
            const defaultAddress = buildAddressString(customer);
            // Cast to access potential addresses property if it exists on backend response but not in interface
            const savedAddresses = (customer as any).addresses || [];

            const allAddresses: AddressOption[] = [
                { id: 'default', label: 'Default Address', value: defaultAddress, isDefault: true },
                ...savedAddresses
            ];

            setAddresses(allAddresses);

            if (!currentAddress && defaultAddress) {
                setLocalAddress(defaultAddress);
                if (defaultAddress !== currentAddress) {
                    onChange(defaultAddress);
                }
            }
        }
    }, [customer, currentAddress, onChange]);

    useEffect(() => {
        if (currentAddress && currentAddress !== localAddress) {
            setLocalAddress(currentAddress);
        }
    }, [currentAddress, localAddress]);

    const buildAddressString = (customer: Customer): string => {
        const parts: string[] = [];

        // Handle address field which can be string or object
        if (customer.address) {
            if (typeof customer.address === 'string') {
                parts.push(customer.address);
            } else if (typeof customer.address === 'object') {
                if (customer.address.address_line1) parts.push(customer.address.address_line1);
                if (customer.address.address_line2) parts.push(customer.address.address_line2);
            }
        }

        if (customer.city) parts.push(customer.city);
        if (customer.state) parts.push(customer.state);
        if (customer.pincode) parts.push(customer.pincode);
        return parts.filter(Boolean).join(', ');
    };

    const handleEdit = (): void => {
        setEditableAddress(localAddress || currentAddress || '');
        setIsEditing(true);
    };

    const handleSave = (): void => {
        setLocalAddress(editableAddress);
        onChange(editableAddress);
        setIsEditing(false);

        if (onSave) {
            onSave(editableAddress);
        }
    };

    const handleCancel = (): void => {
        setIsEditing(false);
        setEditableAddress('');
    };

    const handleSelectChange = (e: ChangeEvent<HTMLSelectElement>): void => {
        onChange(e.target.value);
    };

    if (addressType === 'shipping' && sameAsBilling) {
        return (
            <div className={`bg-gray-50 p-3 rounded-lg ${className}`}>
                <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 flex items-center">
                        <MapPin className="w-4 h-4 mr-1" />
                        Shipping Address
                    </label>
                    <label className="flex items-center text-sm">
                        <input
                            type="checkbox"
                            checked={sameAsBilling}
                            onChange={(e) => onSameAsBillingChange && onSameAsBillingChange(e.target.checked)}
                            className="mr-2 rounded border-gray-300"
                        />
                        Same as billing
                    </label>
                </div>
                <p className="text-sm text-gray-600 italic">Using billing address</p>
            </div>
        );
    }

    return (
        <div className={`bg-white border border-gray-200 rounded-lg p-3 ${className}`}>
            <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700 flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    {addressType === 'billing' ? 'Billing Address' : 'Shipping Address'}
                </label>
                <div className="flex items-center gap-2">
                    {addressType === 'shipping' && onSameAsBillingChange && (
                        <label className="flex items-center text-sm">
                            <input
                                type="checkbox"
                                checked={sameAsBilling}
                                onChange={(e) => onSameAsBillingChange(e.target.checked)}
                                className="mr-2 rounded border-gray-300"
                            />
                            Same as billing
                        </label>
                    )}
                    {!isEditing && (
                        <button
                            onClick={handleEdit}
                            className="text-blue-600 hover:text-blue-700 p-1"
                            title="Edit address"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {isEditing ? (
                <div className="space-y-2">
                    <textarea
                        value={editableAddress}
                        onChange={(e) => setEditableAddress(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        rows={3}
                        placeholder="Enter complete address..."
                        autoFocus
                    />
                    <div className="flex justify-end gap-2">
                        <button
                            onClick={handleCancel}
                            className="px-3 py-1 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                        >
                            <X className="w-4 h-4 inline mr-1" />
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-3 py-1 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm"
                        >
                            <Check className="w-4 h-4 inline mr-1" />
                            Save
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {addresses.length > 1 && (
                        <div className="mb-2">
                            <select
                                value={currentAddress}
                                onChange={handleSelectChange}
                                className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                                {addresses.map((addr: AddressOption) => (
                                    <option key={addr.id} value={addr.value}>
                                        {addr.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <div className="text-sm text-gray-700">
                        {currentAddress || localAddress || (
                            <span className="text-gray-400 italic">No address available</span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default AddressSelector;
