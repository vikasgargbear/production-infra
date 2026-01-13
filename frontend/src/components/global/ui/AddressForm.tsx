import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { MapPin, Edit2, Check, X, Plus, Phone, Building2, Home, LucideIcon } from 'lucide-react';
import { apiClient } from '../../../services/api';

// Imports from centralized types
import type {
    Customer,
    CustomerAddress
} from '../../sales/invoice/types/invoiceTypes';

// ==================== TYPE DEFINITIONS ====================

// Mapping CustomerAddress from invoiceTypes to local AddressData structure expectation
// or redefining AddressData to align with CustomerAddress
interface AddressData extends CustomerAddress {
    mobile?: string;
    landmark?: string;
}

interface SavedAddress extends Partial<AddressData> {
    id?: string | number;
    address_id?: string | number;
    label?: string;
    address_type?: string;
    is_default?: boolean;
    address?: string;
    address2?: string;
    state?: string;
    pincode?: string;
    phone?: string;
}

export interface AddressFormProps {
    customer?: Customer | null;
    addressData?: Partial<AddressData>;
    addressType?: 'billing' | 'shipping';
    onChange?: (addressString: string) => void;
    onSave?: (data: AddressData | SavedAddress) => void;
    sameAsBilling?: boolean;
    onSameAsBillingChange?: (sameAsBilling: boolean) => void;
    billingAddressData?: AddressData | null;
    className?: string;
    title?: string;
    readonly?: boolean;
}

// ==================== COMPONENT ====================

const AddressForm: React.FC<AddressFormProps> = ({
    customer,
    addressData,
    addressType = 'billing',
    onChange,
    onSave,
    sameAsBilling = false,
    onSameAsBillingChange,
    billingAddressData = null,
    className = ''
}) => {
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [showDropdown, setShowDropdown] = useState<boolean>(false);
    const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
    const [selectedAddressId, setSelectedAddressId] = useState<string | number | null>(null);
    const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
    const [loadingAddresses, setLoadingAddresses] = useState<boolean>(false);

    const customerIdRef = useRef<string | number | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Click outside to close dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };

        if (showDropdown) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [showDropdown]);

    const [formData, setFormData] = useState<AddressData>({
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        pincode: '',
        country: '',
        mobile: '',
        landmark: ''
    });

    useEffect(() => {
        const currentCustomerId = customer?.customer_id;

        if (currentCustomerId && currentCustomerId !== customerIdRef.current) {
            customerIdRef.current = currentCustomerId;
            fetchCustomerAddresses(currentCustomerId);
        } else if (customer && !currentCustomerId) {
            // Helper to safely get string value
            const getStr = (val: unknown): string => typeof val === 'string' ? val : '';

            const mobileNumber = getStr(customer.primary_phone || (customer as any).mobile || (customer as any).phone ||
                (customer as any).contact_number || addressData?.mobile);

            const custAddress = typeof customer.address === 'object' ? customer.address : null;
            const addressStr = typeof customer.address === 'string' ? customer.address : '';

            const newFormData: AddressData = {
                address_line1: custAddress?.address_line1 || addressStr || addressData?.address_line1 || '',
                address_line2: custAddress?.address_line2 || (customer as any).address2 || addressData?.address_line2 || '',
                city: custAddress?.city || customer.city || addressData?.city || '',
                state: custAddress?.state || customer.state || (customer as any).state || addressData?.state || '',
                pincode: custAddress?.pincode || customer.pincode || (customer as any).pincode || addressData?.pincode || '',
                country: custAddress?.country || customer.country || addressData?.country || '',
                mobile: mobileNumber,
                landmark: (customer as any).landmark || addressData?.landmark || ''
            };

            setFormData(newFormData);

            if (onSave && addressType === 'billing') {
                onSave(newFormData);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customer]);

    const fetchCustomerAddresses = async (customerId: string | number): Promise<void> => {
        setLoadingAddresses(true);
        try {
            const cacheKey = `customer_addresses_${customerId}`;
            const cached = localStorage.getItem(cacheKey);
            const cacheTime = localStorage.getItem(`${cacheKey}_time`);
            const cacheAge = cacheTime ? Date.now() - parseInt(cacheTime) : Infinity;

            if (cached && cacheAge < 5 * 60 * 1000) {
                const addresses: SavedAddress[] = JSON.parse(cached);
                const filteredAddresses = addresses.filter(addr =>
                    !addr.address_type || addr.address_type === addressType || addr.is_default
                );
                setSavedAddresses(filteredAddresses.length > 0 ? filteredAddresses : addresses);

                const defaultAddr = filteredAddresses.find(addr =>
                    addr.address_type === addressType && addr.is_default
                ) || filteredAddresses.find(addr => addr.is_default) || filteredAddresses[0];

                if (defaultAddr) {
                    selectAddress(defaultAddr);
                }
                setLoadingAddresses(false);
                return;
            }

            const response = await apiClient.get(`/customers/${customerId}/addresses`);

            if (response.data?.success && response.data.data) {
                const addresses: SavedAddress[] = response.data.data;

                localStorage.setItem(cacheKey, JSON.stringify(addresses));
                localStorage.setItem(`${cacheKey}_time`, Date.now().toString());

                const filteredAddresses = addresses.filter(addr =>
                    !addr.address_type || addr.address_type === addressType || addr.is_default
                );
                setSavedAddresses(filteredAddresses.length > 0 ? filteredAddresses : addresses);

                const defaultAddr = filteredAddresses.find(addr =>
                    addr.address_type === addressType && addr.is_default
                ) || filteredAddresses.find(addr => addr.is_default) || filteredAddresses[0];

                if (defaultAddr) {
                    selectAddress(defaultAddr);
                }
            }
        } catch (error) {
            console.error('[AddressForm] Failed to fetch addresses:', error);
            const fallbackAddress: SavedAddress = {
                id: 'default',
                label: addressType === 'billing' ? 'Billing Address' : 'Shipping Address',
                address_line1: (typeof customer?.address === 'string' ? customer.address : customer?.address?.address_line1) || (customer as any)?.address_line1 || '',
                address_line2: (customer as any)?.address2 || (customer as any)?.address_line2 || '',
                city: customer?.city || (customer as any)?.billing_city || '',
                state: customer?.state || (customer as any)?.state || (customer as any)?.billing_state || '',
                pincode: (customer as any)?.pincode || (customer as any)?.pincode || (customer as any)?.billing_pincode || '',
                mobile: (customer as any)?.mobile || (customer as any)?.phone || customer?.primary_phone || '',
                country: ''
            };
            setSavedAddresses([fallbackAddress]);
            selectAddress(fallbackAddress);
        } finally {
            setLoadingAddresses(false);
        }
    };

    const selectAddress = (address: SavedAddress): void => {
        setSelectedAddressId(address.id || address.address_id || null);
        const mobileNumber = address.mobile || address.phone ||
            customer?.mobile || customer?.phone ||
            customer?.primary_phone || (customer as any)?.contact_number || (customer as any)?.mobile || '';

        setFormData({
            address_line1: address.address_line1 || address.address || '',
            address_line2: address.address_line2 || address.address2 || '',
            city: address.city || '',
            state: address.state || address.state || '',
            pincode: address.pincode || address.pincode || address.pincode || '',
            country: address.country || '',
            mobile: mobileNumber,
            landmark: address.landmark || ''
        });

        const addressString = buildAddressString(address);
        if (onChange) {
            onChange(addressString);
        }
        if (onSave) {
            onSave({
                ...address,
                mobile: address.mobile || customer?.phone || customer?.mobile || ''
            });
        }

        setShowDropdown(false);
        setIsEditing(false);
        setIsAddingNew(false);
    };

    const buildAddressString = (data: Partial<AddressData> | SavedAddress): string => {
        const parts: string[] = [];
        if (data.address_line1) parts.push(data.address_line1);
        if (data.address_line2) parts.push(data.address_line2);
        if (data.landmark) parts.push(`Near ${data.landmark}`);
        if (data.city) parts.push(data.city);
        if (data.state) parts.push(data.state);
        if (data.pincode) parts.push(data.pincode);
        if (data.mobile) parts.push(`Ph: ${data.mobile}`);
        return parts.filter(Boolean).join(', ');
    };

    const handleFieldChange = (field: keyof AddressData, value: string): void => {
        const newData = { ...formData, [field]: value };
        setFormData(newData);

        const addressString = buildAddressString(newData);
        if (onChange) {
            onChange(addressString);
        }
    };

    const handleEdit = (): void => {
        setShowDropdown(true);
    };

    const handleAddNew = (): void => {
        setIsAddingNew(true);
        setIsEditing(true);
        setShowDropdown(false);
        setSelectedAddressId(null);

        const mobileNumber = customer?.mobile || customer?.phone ||
            customer?.primary_phone || (customer as any)?.contact_number || (customer as any)?.mobile || '';

        setFormData({
            address_line1: '',
            address_line2: '',
            city: '',
            state: '',
            pincode: '',
            country: '',
            mobile: mobileNumber,
            landmark: ''
        });
    };

    const handleSave = async (): Promise<void> => {
        const addressString = buildAddressString(formData);

        if (isAddingNew && customer?.customer_id) {
            try {
                const response = await apiClient.post(`/customers/${customer.customer_id}/addresses`, {
                    ...formData,
                    address_type: addressType,
                    is_default: savedAddresses.length === 0
                });

                if (response.data?.success) {
                    await fetchCustomerAddresses(customer.customer_id);
                }
            } catch (error) {
                console.error('[AddressForm] Failed to save address:', error);
            }
        }

        setIsEditing(false);
        setIsAddingNew(false);

        if (onChange) {
            onChange(addressString);
        }

        if (onSave) {
            onSave(formData);
        }
    };

    const handleCancel = (): void => {
        setIsEditing(false);
        setIsAddingNew(false);
        setShowDropdown(false);

        if (selectedAddressId && savedAddresses.length > 0) {
            const selected = savedAddresses.find(a => a.id === selectedAddressId || a.address_id === selectedAddressId);
            if (selected) selectAddress(selected);
        } else if (customer) {
            setFormData({
                address_line1: (typeof customer.address === 'string' ? customer.address : customer.address?.address_line1) || '',
                address_line2: (customer as any).address2 || '',
                city: (customer as any).city || '',
                state: (customer as any).state || '',
                pincode: (customer as any).pincode || (customer as any).pincode || '',
                country: (customer as any).country || '',
                mobile: (customer as any).mobile || (customer as any).phone || '',
                landmark: (customer as any).landmark || ''
            });
        }
    };

    const getAddressIcon = (type?: string): LucideIcon => {
        switch (type) {
            case 'home': return Home;
            case 'office': return Building2;
            default: return MapPin;
        }
    };

    if (addressType === 'shipping' && sameAsBilling && billingAddressData) {
        const mobileNumber = billingAddressData?.mobile || customer?.phone || customer?.mobile;
        return (
            <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 ${className}`}>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center">
                        <MapPin className="w-4 h-4 mr-2 text-gray-500" />
                        Shipping Address
                    </h3>
                    {onSameAsBillingChange && (
                        <label className="flex items-center text-sm">
                            <input
                                type="checkbox"
                                checked={sameAsBilling}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => onSameAsBillingChange(e.target.checked)}
                                className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Same as billing
                        </label>
                    )}
                </div>

                <div className="text-sm text-gray-600">
                    <div className="space-y-1">
                        {billingAddressData?.address_line1 && <p>{billingAddressData.address_line1}</p>}
                        {billingAddressData?.address_line2 && <p>{billingAddressData.address_line2}</p>}
                        {billingAddressData?.landmark && <p className="text-xs text-gray-500">Near {billingAddressData.landmark}</p>}
                        <p>
                            {[billingAddressData?.city, billingAddressData?.state, billingAddressData?.pincode].filter(Boolean).join(', ')}
                        </p>
                        {mobileNumber && (
                            <p className="flex items-center gap-1 text-xs text-gray-700 font-medium">
                                <Phone className="w-3 h-3" />
                                {mobileNumber}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`bg-gray-50 border border-gray-200 rounded-lg p-4 relative ${className}`}>
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center">
                    <MapPin className="w-4 h-4 mr-2 text-gray-500" />
                    {addressType === 'billing' ? 'Billing Address' : 'Shipping Address'}
                </h3>

                <div className="flex items-center gap-2">
                    {addressType === 'shipping' && onSameAsBillingChange && (
                        <label className="flex items-center text-sm mr-3">
                            <input
                                type="checkbox"
                                checked={sameAsBilling}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => onSameAsBillingChange(e.target.checked)}
                                className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Same as billing
                        </label>
                    )}

                    {!isEditing && !isAddingNew && (
                        <button
                            onClick={handleEdit}
                            className="text-blue-600 hover:text-blue-700 p-1"
                            title="Select or edit address"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                    )}

                    {(isEditing || isAddingNew) && (
                        <div className="flex gap-1">
                            <button
                                onClick={handleSave}
                                className="text-green-600 hover:text-green-700 p-1"
                                title="Save address"
                            >
                                <Check className="w-4 h-4" />
                            </button>
                            <button
                                onClick={handleCancel}
                                className="text-red-600 hover:text-red-700 p-1"
                                title="Cancel"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {showDropdown && !isEditing && !isAddingNew && (
                <div className="absolute top-14 left-0 right-0 z-20 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {loadingAddresses ? (
                        <div className="p-4 text-center text-gray-500">Loading addresses...</div>
                    ) : (
                        <>
                            {savedAddresses.length > 0 && (
                                <div className="p-2">
                                    <div className="text-xs text-gray-500 uppercase px-2 py-1">Saved Addresses</div>
                                    {savedAddresses.map((addr) => {
                                        const Icon = getAddressIcon(addr.address_type || addressType);
                                        const displayLabel = addr.label ||
                                            (addr.address_type === 'billing' ? 'Billing Address' :
                                                addr.address_type === 'shipping' ? 'Shipping Address' :
                                                    addressType === 'billing' ? 'Billing Address' : 'Shipping Address');

                                        return (
                                            <button
                                                key={String(addr.id || addr.address_id)}
                                                onClick={() => selectAddress(addr)}
                                                className={`w-full text-left p-3 hover:bg-gray-50 rounded-lg transition-colors ${selectedAddressId === (addr.id || addr.address_id) ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                                                    }`}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <Icon className="w-4 h-4 text-gray-400 mt-0.5" />
                                                    <div className="flex-1">
                                                        <div className="font-medium text-sm text-gray-900">
                                                            {displayLabel}
                                                            {addr.is_default && (
                                                                <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Default</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-gray-600 mt-1">
                                                            {buildAddressString(addr)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="border-t border-gray-200 p-2">
                                <button
                                    onClick={handleAddNew}
                                    className="w-full p-3 hover:bg-blue-50 rounded-lg transition-colors flex items-center justify-center gap-2 text-blue-600 font-medium text-sm"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add New Address
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {(isEditing || isAddingNew) ? (
                <div className="space-y-3">
                    {isAddingNew && (
                        <div className="bg-blue-50 text-blue-700 text-xs p-2 rounded">
                            Adding new {addressType} address
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                            <input
                                type="text"
                                value={formData.address_line1}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('address_line1', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                placeholder="Address Line 1 *"
                            />
                        </div>

                        <div className="col-span-2">
                            <input
                                type="text"
                                value={formData.address_line2}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('address_line2', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                placeholder="Address Line 2 (Optional)"
                            />
                        </div>

                        <div>
                            <input
                                type="text"
                                value={formData.landmark}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('landmark', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                placeholder="Landmark"
                            />
                        </div>

                        <div>
                            <input
                                type="text"
                                value={formData.city}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('city', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                placeholder="City *"
                            />
                        </div>

                        <div>
                            <input
                                type="text"
                                value={formData.state}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('state', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                placeholder="State *"
                            />
                        </div>

                        <div>
                            <input
                                type="text"
                                value={formData.pincode}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('pincode', e.target.value)}
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                placeholder="Pincode *"
                                maxLength={6}
                            />
                        </div>

                        <div className="col-span-2">
                            <div className="relative">
                                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="tel"
                                    value={formData.mobile}
                                    onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('mobile', e.target.value)}
                                    className="w-full pl-10 pr-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                                    placeholder="Mobile Number *"
                                    maxLength={10}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-sm text-gray-700">
                    {buildAddressString(formData)}
                </div>
            )}
        </div>
    );
};

export default AddressForm;

// Re-export types for external use
export type { AddressData, SavedAddress, Customer };

