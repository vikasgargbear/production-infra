import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { MapPin, Edit2, Check, Plus, Phone, Building2, Home, LucideIcon } from 'lucide-react';
import { apiClient, customersApi } from '../../../services/api';
import GSTJurisdictionSelect from './forms/GSTJurisdictionSelect';

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
    address_id?: string | number;
    label?: string;
    address_type?: string;
    is_default?: boolean;
    pincode?: string;
    country_code?: string;
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
    // External control props
    isAddMode?: boolean;  // Externally trigger add mode
    onExitAddMode?: () => void;  // Callback when exiting add mode
}

// ==================== COMPONENT ====================

type AddressValidationErrors = Partial<Record<'address_line1' | 'city' | 'state' | 'pincode', string>>;

export const validateCustomerAddress = (data: Partial<AddressData>): AddressValidationErrors => {
    const errors: AddressValidationErrors = {};
    if (!data.address_line1?.trim()) errors.address_line1 = 'Address line 1 is required';
    if (!data.city?.trim()) errors.city = 'City is required';
    if (!/^\d{2}$/.test(String(data.state || '').trim())) {
        errors.state = 'Enter the 2-digit GST state code';
    }
    if (!/^\d{6}$/.test(String(data.pincode || '').trim())) {
        errors.pincode = 'Enter a valid 6-digit pincode';
    }
    return errors;
};

const AddressForm: React.FC<AddressFormProps> = ({
    customer,
    addressType = 'billing',
    onChange,
    onSave,
    sameAsBilling = false,
    onSameAsBillingChange,
    billingAddressData = null,
    className = '',
    isAddMode = false,
    onExitAddMode
}) => {
    const [isEditing, setIsEditing] = useState<boolean>(false);
    const [showDropdown, setShowDropdown] = useState<boolean>(false);
    const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
    const [selectedAddressId, setSelectedAddressId] = useState<string | number | null>(null);
    const [isAddingNew, setIsAddingNew] = useState<boolean>(false);
    const [isDefault, setIsDefault] = useState<boolean>(false);
    const [loadingAddresses, setLoadingAddresses] = useState<boolean>(false);
    const [addressLoadError, setAddressLoadError] = useState<string>('');
    const [saving, setSaving] = useState<boolean>(false);
    const [saveError, setSaveError] = useState<string>('');
    const [fieldErrors, setFieldErrors] = useState<AddressValidationErrors>({});

    const customerIdRef = useRef<string | number | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const editFormRef = useRef<HTMLDivElement>(null);

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

    // Click outside or Escape to close edit form
    useEffect(() => {
        if (!isEditing && !isAddingNew) return;

        const handleClickOutside = (event: MouseEvent) => {
            if (editFormRef.current && !editFormRef.current.contains(event.target as Node)) {
                handleCancel();
            }
        };

        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                handleCancel();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscapeKey);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscapeKey);
        };
    // The handlers intentionally read the current form state; listener setup is
    // bounded by the edit-mode state rather than handler identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditing, isAddingNew]);

    // Handle external trigger to enter add mode
    useEffect(() => {
        if (isAddMode && !isAddingNew) {
            handleAddNew();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAddMode, isAddingNew]);

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
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customer]);

    const fetchCustomerAddresses = async (
        customerId: string | number,
        preferredAddressId?: string,
    ): Promise<SavedAddress[]> => {
        setLoadingAddresses(true);
        setAddressLoadError('');
        try {
            const response = await apiClient.get(`/customers/${customerId}/addresses`);
            if (!response.data?.success || !Array.isArray(response.data.data)) {
                throw new Error('The server returned an invalid address response.');
            }
            const allAddresses: SavedAddress[] = response.data.data;

            const filteredAddresses = allAddresses.filter(addr =>
                !addr.address_type || addr.address_type === addressType || addr.is_default
            );
            setSavedAddresses(filteredAddresses.length > 0 ? filteredAddresses : allAddresses);

            const availableAddresses = filteredAddresses.length > 0
                ? filteredAddresses
                : allAddresses;
            const defaultAddr = preferredAddressId
                ? availableAddresses.find(addr => String(addr.address_id) === preferredAddressId)
                : filteredAddresses.find(addr =>
                    addr.address_type === addressType && addr.is_default
                ) || filteredAddresses.find(addr => addr.is_default) || filteredAddresses[0];

            if (defaultAddr) {
                selectAddress(defaultAddr);
            }
            return availableAddresses;
        } catch (error) {
            console.error('[AddressForm] Failed to fetch addresses:', error);
            setSavedAddresses([]);
            setAddressLoadError('Saved addresses could not be loaded from the server.');
            return [];
        } finally {
            setLoadingAddresses(false);
        }
    };

    const selectAddress = (address: SavedAddress): void => {
        setSelectedAddressId(address.address_id || null);
        const mobileNumber = address.mobile || customer?.primary_phone || '';

        setFormData({
            address_line1: address.address_line1 || '',
            address_line2: address.address_line2 || '',
            city: address.city || '',
            state: String(address.state_code ?? '').trim(),
            pincode: address.pincode || '',
            country: address.country_code || '',
            mobile: mobileNumber,
            landmark: address.landmark || ''
        });
        setIsDefault(address.is_default || false);

        const addressString = buildAddressString(address);
        if (onChange) {
            onChange(addressString);
        }
        if (onSave) {
            onSave({
                ...address,
                mobile: address.mobile || customer?.primary_phone || ''
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
        if (data.state_code) parts.push(data.state_code);
        else if (data.state) parts.push(data.state);
        if (data.pincode) parts.push(data.pincode);
        if (data.mobile) parts.push(`Ph: ${data.mobile}`);
        return parts.filter(Boolean).join(', ');
    };

    const handleFieldChange = (field: keyof AddressData, value: string): void => {
        const newData = { ...formData, [field]: value };
        setFormData(newData);
        setSaveError('');
        if (field in fieldErrors) {
            setFieldErrors(previous => ({ ...previous, [field]: undefined }));
        }

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
        setSaveError('');
        setFieldErrors({});

        const mobileNumber = customer?.primary_phone || '';

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
        const customerId = customer?.customer_id;
        if (!customerId) {
            setSaveError('Select a saved customer before adding an address.');
            return;
        }

        const validationErrors = validateCustomerAddress(formData);
        if (Object.keys(validationErrors).length > 0) {
            setFieldErrors(validationErrors);
            setSaveError('Complete the required address fields before saving.');
            return;
        }

        const addressPayload = {
            address_line1: String(formData.address_line1).trim(),
            address_line2: formData.address_line2?.trim() || undefined,
            city: String(formData.city).trim(),
            state_code: String(formData.state).trim(),
            pincode: String(formData.pincode).trim(),
            landmark: formData.landmark?.trim() || undefined,
            address_type: addressType,
            is_default: isDefault
        };

        setSaving(true);
        setSaveError('');
        let accepted = false;
        try {
            if (isAddingNew) {
                const response = await customersApi.createAddress(String(customerId), addressPayload);
                if (!response.data?.success || !response.data?.address_id) {
                    throw new Error('The server did not confirm the saved address.');
                }
                const addressId = String(response.data.address_id);
                const refreshed = await fetchCustomerAddresses(customerId, addressId);
                if (!refreshed.some(address => String(address.address_id) === addressId)) {
                    throw new Error('The saved address was not present in the authoritative address readback.');
                }
                accepted = true;
            } else if (isEditing && selectedAddressId) {
                const addressIdStr = String(selectedAddressId);
                if (addressIdStr.startsWith('temp_addr_')) {
                    throw new Error('This legacy offline address was never accepted by the server. Recreate it.');
                }
                const selectedAddress = savedAddresses.find(
                    address => String(address.address_id) === addressIdStr,
                );
                if (!selectedAddress || !Number.isInteger(Number(selectedAddress.row_version))) {
                    throw new Error('Reload the canonical address before editing it.');
                }
                const response = await customersApi.updateAddress(
                    String(customerId),
                    addressIdStr,
                    {
                        ...addressPayload,
                        row_version: Number(selectedAddress.row_version),
                    },
                );
                if (!response.data?.success) {
                    throw new Error('The server did not confirm the address update.');
                }
                const refreshed = await fetchCustomerAddresses(customerId, addressIdStr);
                if (!refreshed.some(address => String(address.address_id) === addressIdStr)) {
                    throw new Error('The updated address was not present in the authoritative address readback.');
                }
                accepted = true;
            }
        } catch (error: any) {
            const detail = error?.response?.data?.detail;
            setSaveError(typeof detail === 'string' ? detail : 'Address was not saved. Check the details and try again.');
        } finally {
            setSaving(false);
        }

        if (!accepted) return;

        setIsEditing(false);
        setIsAddingNew(false);
        setIsDefault(false);
        setFieldErrors({});
    };

    const handleCancel = (): void => {
        setIsEditing(false);
        setIsAddingNew(false);
        setShowDropdown(false);

        if (selectedAddressId && savedAddresses.length > 0) {
            const selected = savedAddresses.find(a => a.address_id === selectedAddressId);
            if (selected) selectAddress(selected);
        } else if (customer) {
            setFormData({
                address_line1: '',
                address_line2: '',
                city: '',
                state: '',
                pincode: '',
                country: '',
                mobile: customer.primary_phone || '',
                landmark: '',
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
        const mobileNumber = billingAddressData?.mobile || customer?.primary_phone;
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
        <div className={`relative ${className}`}>
            {/* Edit button shown when not editing - edits current address */}
            {!isEditing && !isAddingNew && (
                <div className="flex items-center gap-1 absolute top-0 right-0 z-10">
                    <button
                        onClick={handleEdit}
                        className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors flex items-center gap-1.5"
                        title="Edit address or select from saved"
                    >
                        <Edit2 className="w-3.5 h-3.5" />
                        Change
                    </button>
                </div>
            )}

            {showDropdown && !isEditing && !isAddingNew && (
                <div className="absolute top-14 left-0 right-0 z-20 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {loadingAddresses ? (
                        <div className="p-4 text-center text-gray-500">Loading addresses...</div>
                    ) : addressLoadError ? (
                        <div role="alert" className="p-4 text-center">
                            <p className="text-sm text-red-700">{addressLoadError}</p>
                            <button
                                type="button"
                                onClick={() => customer?.customer_id && fetchCustomerAddresses(customer.customer_id)}
                                className="mt-3 min-h-11 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"
                            >
                                Retry
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* Filter to only shipping addresses for Indian GST compliance - billing comes from backend */}
                            {savedAddresses.length > 0 && (
                                <div className="p-2">
                                    <div className="text-xs text-gray-500 uppercase px-2 py-1">Saved Addresses</div>
                                    {savedAddresses.map((addr) => {
                                        const Icon = getAddressIcon('shipping');

                                        return (
                                            <div
                                                key={String(addr.address_id)}
                                                className={`flex items-start gap-2 p-3 hover:bg-gray-50 rounded-lg transition-colors ${selectedAddressId === addr.address_id ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                                                    }`}
                                            >
                                                {/* Select button (main click area) */}
                                                <button
                                                    onClick={() => selectAddress(addr)}
                                                    data-testid={addr.address_id
                                                        && addr.row_version !== undefined
                                                        && addr.row_version !== null
                                                        ? `select-address-${addr.address_id}-v${addr.row_version}`
                                                        : undefined}
                                                    aria-label={`Select ${addr.label || addr.address_type || 'delivery'} address ${String(addr.address_id || 'without canonical identity')}`}
                                                    className="flex-1 text-left flex items-start gap-2"
                                                >
                                                    <Icon className="w-4 h-4 text-gray-400 mt-0.5" />
                                                    <div className="flex-1">
                                                        <div className="font-medium text-sm text-gray-900">
                                                            {addr.label || 'Delivery Address'}
                                                            {addr.is_default && (
                                                                <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">Default</span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-gray-600 mt-1">
                                                            {buildAddressString(addr)}
                                                        </div>
                                                    </div>
                                                </button>

                                                {/* Edit button */}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        // Load this address into form for editing
                                                        setFormData({
                                                            address_line1: addr.address_line1 || '',
                                                            address_line2: addr.address_line2 || '',
                                                            landmark: addr.landmark || '',
                                                            city: addr.city || '',
                                                            state: String(addr.state_code ?? '').trim(),
                                                            pincode: addr.pincode || '',
                                                            mobile: addr.mobile || customer?.primary_phone || ''
                                                        });
                                                        setSelectedAddressId(addr.address_id || null);
                                                        setShowDropdown(false);
                                                        setIsEditing(true);
                                                    }}
                                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                                    title="Edit this address"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
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
            )
            }

            {(isEditing || isAddingNew) ? (
                <div ref={editFormRef} className="space-y-4">

                    <div className="grid grid-cols-2 gap-3">
                        {/* Row 1: Address Line 1 */}
                        <div className="col-span-2">
                            <input
                                aria-label="Address line 1"
                                aria-invalid={Boolean(fieldErrors.address_line1)}
                                type="text"
                                value={formData.address_line1}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('address_line1', e.target.value)}
                                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                placeholder="Address Line 1 *"
                            />
                            {fieldErrors.address_line1 && <p className="mt-1 text-xs text-red-600">{fieldErrors.address_line1}</p>}
                        </div>

                        {/* Row 2: Address Line 2 | Landmark */}
                        <div>
                            <input
                                aria-label="City"
                                aria-invalid={Boolean(fieldErrors.city)}
                                type="text"
                                value={formData.address_line2}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('address_line2', e.target.value)}
                                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                placeholder="Address Line 2"
                            />
                        </div>

                        <div>
                            <input
                                type="text"
                                value={formData.landmark}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('landmark', e.target.value)}
                                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                placeholder="Landmark"
                            />
                        </div>

                        {/* Row 3: City | exact GST state code */}
                        <div>
                            <input
                                type="text"
                                value={formData.city}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('city', e.target.value)}
                                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                placeholder="City *"
                            />
                            {fieldErrors.city && <p className="mt-1 text-xs text-red-600">{fieldErrors.city}</p>}
                        </div>

                        <div>
                            <GSTJurisdictionSelect
                                aria-label="GST state code (2 digits)"
                                aria-invalid={Boolean(fieldErrors.state)}
                                value={String(formData.state || '')}
                                onChange={(stateCode) => handleFieldChange('state', stateCode)}
                                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                required
                            />
                            {fieldErrors.state && <p className="mt-1 text-xs text-red-600">{fieldErrors.state}</p>}
                        </div>

                        {/* Row 4: Pincode | Mobile */}
                        <div>
                            <input
                                aria-label="Pincode"
                                aria-invalid={Boolean(fieldErrors.pincode)}
                                inputMode="numeric"
                                type="text"
                                value={formData.pincode}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('pincode', e.target.value)}
                                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                placeholder="Pincode *"
                                maxLength={6}
                            />
                            {fieldErrors.pincode && <p className="mt-1 text-xs text-red-600">{fieldErrors.pincode}</p>}
                        </div>

                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                aria-label="Customer mobile"
                                type="tel"
                                value={formData.mobile}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('mobile', e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                placeholder="Customer mobile"
                                maxLength={10}
                            />
                            <p className="mt-1 text-xs text-gray-500">Used on this document; customer contact remains unchanged.</p>
                        </div>
                    </div>

                    {saveError && (
                        <p role="alert" className="rounded-md border border-red-200 bg-white px-3 py-2 text-sm text-red-700">
                            {saveError}
                        </p>
                    )}

                    {/* Action row: Checkbox | Cancel | Save */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        {/* Default checkbox on left */}
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={isDefault}
                                onChange={(e) => setIsDefault(e.target.checked)}
                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-600">Default address</span>
                        </label>

                        {/* Buttons on right */}
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={saving}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving}
                                className="min-h-11 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 rounded-lg transition-colors flex items-center gap-1.5"
                            >
                                <Check className="w-4 h-4" />
                                {saving ? 'Saving…' : 'Save address'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="pr-8">
                    {/* Address content */}
                    {/* First line: Name, Phone */}
                    <div className="flex items-center flex-wrap gap-1">
                        <span className="font-semibold text-gray-900">
                            {customer?.customer_name || 'Customer identity unavailable'}
                        </span>
                        {(formData.mobile || customer?.primary_phone) && (
                            <span className="font-semibold text-gray-900">
                                , {formData.mobile || customer?.primary_phone}
                            </span>
                        )}
                    </div>

                    {/* Second line: Address with pincode in bold */}
                    <p className="text-sm text-gray-600 mt-1.5">
                        {[
                            formData.address_line1,
                            formData.address_line2,
                            formData.city,
                            formData.state
                        ].filter(Boolean).join(', ')}
                        {formData.pincode && (
                            <span className="font-semibold text-gray-900"> - {formData.pincode}</span>
                        )}
                    </p>
                </div>
            )}
        </div>
    );
};

export default AddressForm;

// Re-export types for external use
export type { AddressData, SavedAddress, Customer };
