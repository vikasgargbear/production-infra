import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { MapPin, Edit2, Check, X, Plus, Phone, Building2, Home, LucideIcon } from 'lucide-react';
import { apiClient } from '../../../services/api';
import offlineDB from '../../../services/offline/core/offlineDatabase';

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
    // External control props
    isAddMode?: boolean;  // Externally trigger add mode
    onExitAddMode?: () => void;  // Callback when exiting add mode
}

// ==================== COMPONENT ====================

// Indian states list with GST codes
const INDIAN_STATES = [
    { code: '01', name: 'Jammu and Kashmir' },
    { code: '02', name: 'Himachal Pradesh' },
    { code: '03', name: 'Punjab' },
    { code: '04', name: 'Chandigarh' },
    { code: '05', name: 'Uttarakhand' },
    { code: '06', name: 'Haryana' },
    { code: '07', name: 'Delhi' },
    { code: '08', name: 'Rajasthan' },
    { code: '09', name: 'Uttar Pradesh' },
    { code: '10', name: 'Bihar' },
    { code: '11', name: 'Sikkim' },
    { code: '12', name: 'Arunachal Pradesh' },
    { code: '13', name: 'Nagaland' },
    { code: '14', name: 'Manipur' },
    { code: '15', name: 'Mizoram' },
    { code: '16', name: 'Tripura' },
    { code: '17', name: 'Meghalaya' },
    { code: '18', name: 'Assam' },
    { code: '19', name: 'West Bengal' },
    { code: '20', name: 'Jharkhand' },
    { code: '21', name: 'Odisha' },
    { code: '22', name: 'Chhattisgarh' },
    { code: '23', name: 'Madhya Pradesh' },
    { code: '24', name: 'Gujarat' },
    { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
    { code: '27', name: 'Maharashtra' },
    { code: '28', name: 'Andhra Pradesh' },
    { code: '29', name: 'Karnataka' },
    { code: '30', name: 'Goa' },
    { code: '31', name: 'Lakshadweep' },
    { code: '32', name: 'Kerala' },
    { code: '33', name: 'Tamil Nadu' },
    { code: '34', name: 'Puducherry' },
    { code: '35', name: 'Andaman and Nicobar Islands' },
    { code: '36', name: 'Telangana' },
    { code: '37', name: 'Andhra Pradesh (New)' },
    { code: '38', name: 'Ladakh' }
];

const AddressForm: React.FC<AddressFormProps> = ({
    customer,
    addressData,
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

    // Handle external trigger to enter add mode
    useEffect(() => {
        if (isAddMode && !isAddingNew) {
            handleAddNew();
        }
    }, [isAddMode]);

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

            let syncedAddresses: SavedAddress[] = [];

            // Try to get from cache or API
            if (cached && cacheAge < 5 * 60 * 1000) {
                syncedAddresses = JSON.parse(cached);
            } else {
                try {
                    const response = await apiClient.get(`/customers/${customerId}/addresses`);
                    if (response.data?.success && response.data.data) {
                        syncedAddresses = response.data.data;
                        localStorage.setItem(cacheKey, JSON.stringify(syncedAddresses));
                        localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
                    }
                } catch (apiError) {
                    console.warn('[AddressForm] API fetch failed, using local data:', apiError);
                    // Continue with local data only
                }
            }

            // OFFLINE-FIRST: Get locally pending addresses from IndexedDB
            let pendingAddresses: SavedAddress[] = [];
            try {
                pendingAddresses = await offlineDB.getCustomerAddresses(customerId);
                // Filter to only pending (not-yet-synced) addresses
                pendingAddresses = pendingAddresses.filter((a: any) =>
                    a.sync_status === 'pending' && String(a.id).startsWith('temp_addr_')
                );
            } catch (e) {
                console.warn('[AddressForm] Error getting local addresses:', e);
            }

            // Merge synced + pending addresses
            const allAddresses = [...syncedAddresses, ...pendingAddresses];

            const filteredAddresses = allAddresses.filter(addr =>
                !addr.address_type || addr.address_type === addressType || addr.is_default
            );
            setSavedAddresses(filteredAddresses.length > 0 ? filteredAddresses : allAddresses);

            const defaultAddr = filteredAddresses.find(addr =>
                addr.address_type === addressType && addr.is_default
            ) || filteredAddresses.find(addr => addr.is_default) || filteredAddresses[0];

            if (defaultAddr) {
                selectAddress(defaultAddr);
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
            state: address.state || (address as any).state_name || '',
            pincode: address.pincode || '',
            country: address.country || 'India',
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
        const customerId = customer?.customer_id;

        if (!customerId) {
            console.error('[AddressForm] No customer ID');
            return;
        }

        const addressPayload = {
            address_line1: formData.address_line1,
            address_line2: formData.address_line2,
            city: formData.city,
            state: formData.state,
            pincode: formData.pincode,
            mobile: formData.mobile,
            landmark: formData.landmark,
            address_type: addressType,
            is_default: isDefault
        };

        if (isAddingNew) {
            // ADDING NEW ADDRESS
            try {
                // OFFLINE-FIRST: Save to IndexedDB immediately
                const tempId = await offlineDB.saveCustomerAddress(customerId, addressPayload);
                console.log('[AddressForm] Saved new address offline:', tempId);

                // Add to local state immediately
                const newAddr = { id: tempId, ...addressPayload, sync_status: 'pending' };
                setSavedAddresses(prev => [...prev, newAddr as any]);

                // Try to sync to API (non-blocking)
                try {
                    const response = await apiClient.post(`/customers/${customerId}/addresses`, addressPayload);
                    if (response.data?.success) {
                        await offlineDB.markAddressSynced(tempId, response.data.address_id);
                        console.log('[AddressForm] New address synced:', response.data.address_id);

                        // Refresh list
                        const cacheKey = `customer_addresses_${customerId}`;
                        localStorage.removeItem(cacheKey);
                        await fetchCustomerAddresses(customerId);
                    }
                } catch (syncError) {
                    console.warn('[AddressForm] API sync failed, will retry later:', syncError);
                }
            } catch (error) {
                console.error('[AddressForm] Failed to save address:', error);
            }
        } else if (isEditing && selectedAddressId) {
            // EDITING EXISTING ADDRESS
            try {
                // Update local state immediately
                setSavedAddresses(prev => prev.map(addr =>
                    (addr.id === selectedAddressId || addr.address_id === selectedAddressId)
                        ? { ...addr, ...addressPayload }
                        : addr
                ));
                console.log('[AddressForm] Updated address locally:', selectedAddressId);

                // Only sync to API if it's a real database address (not a temp local one)
                const addressIdStr = String(selectedAddressId);
                const isLocalPending = addressIdStr.startsWith('temp_addr_');

                if (!isLocalPending) {
                    // Try to sync to API (non-blocking)
                    try {
                        await apiClient.put(`/customers/${customerId}/addresses/${selectedAddressId}`, addressPayload);
                        console.log('[AddressForm] Address update synced to server');

                        // Refresh list
                        const cacheKey = `customer_addresses_${customerId}`;
                        localStorage.removeItem(cacheKey);
                        await fetchCustomerAddresses(customerId);
                    } catch (syncError) {
                        console.warn('[AddressForm] Address update sync failed:', syncError);
                        // Local update already applied
                    }
                } else {
                    // Update the IndexedDB record so sync queue sends edited data
                    try {
                        const db = await offlineDB.init();
                        const existingRecord = await db.get('customer_addresses', addressIdStr);
                        if (existingRecord) {
                            const updatedRecord = {
                                ...existingRecord,
                                ...addressPayload,
                                updated_at: new Date().toISOString()
                            };
                            await db.put('customer_addresses', updatedRecord);
                            console.log('[AddressForm] Updated IndexedDB record for pending address:', addressIdStr);
                        }
                    } catch (dbError) {
                        console.warn('[AddressForm] Failed to update IndexedDB record:', dbError);
                    }
                }
            } catch (error) {
                console.error('[AddressForm] Failed to update address:', error);
            }
        }

        setIsEditing(false);
        setIsAddingNew(false);
        setIsDefault(false);

        if (onChange) {
            onChange(addressString);
        }

        if (onSave) {
            onSave({ ...formData, is_default: isDefault });
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
        <div className={`relative ${className}`}>
            {/* Edit button shown when not editing - edits current address */}
            {!isEditing && !isAddingNew && (
                <div className="flex items-center gap-1 absolute top-0 right-0 z-10">
                    <button
                        onClick={handleEdit}
                        className="text-blue-600 hover:text-blue-700 p-1.5 hover:bg-blue-50 rounded-md transition-colors"
                        title="Edit address or select from saved"
                    >
                        <Edit2 className="w-4 h-4" />
                    </button>
                </div>
            )}

            {showDropdown && !isEditing && !isAddingNew && (
                <div className="absolute top-14 left-0 right-0 z-20 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {loadingAddresses ? (
                        <div className="p-4 text-center text-gray-500">Loading addresses...</div>
                    ) : (
                        <>
                            {/* Filter to only shipping addresses for Indian GST compliance - billing comes from backend */}
                            {savedAddresses.filter(a => a.address_type !== 'billing').length > 0 && (
                                <div className="p-2">
                                    <div className="text-xs text-gray-500 uppercase px-2 py-1">Saved Addresses</div>
                                    {savedAddresses.filter(a => a.address_type !== 'billing').map((addr) => {
                                        const Icon = getAddressIcon('shipping');

                                        return (
                                            <div
                                                key={String(addr.id || addr.address_id)}
                                                className={`flex items-start gap-2 p-3 hover:bg-gray-50 rounded-lg transition-colors ${selectedAddressId === (addr.id || addr.address_id) ? 'bg-blue-50 border-l-2 border-blue-500' : ''
                                                    }`}
                                            >
                                                {/* Select button (main click area) */}
                                                <button
                                                    onClick={() => selectAddress(addr)}
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
                                                            state: addr.state || (addr as any).state_name || '',
                                                            pincode: addr.pincode || '',
                                                            mobile: addr.mobile || addr.phone || ''
                                                        });
                                                        setSelectedAddressId(addr.id || addr.address_id || null);
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
                <div className="space-y-4">

                    <div className="grid grid-cols-2 gap-3">
                        {/* Row 1: Address Line 1 */}
                        <div className="col-span-2">
                            <input
                                type="text"
                                value={formData.address_line1}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('address_line1', e.target.value)}
                                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                placeholder="Address Line 1 *"
                            />
                        </div>

                        {/* Row 2: Address Line 2 | Landmark */}
                        <div>
                            <input
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

                        {/* Row 3: City | State */}
                        <div>
                            <input
                                type="text"
                                value={formData.city}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('city', e.target.value)}
                                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                placeholder="City *"
                            />
                        </div>

                        <div>
                            <select
                                value={formData.state}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) => handleFieldChange('state', e.target.value)}
                                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                            >
                                <option value="">Select State *</option>
                                {INDIAN_STATES.map(state => (
                                    <option key={state.code} value={state.name}>
                                        {state.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Row 4: Pincode | Mobile */}
                        <div>
                            <input
                                type="text"
                                value={formData.pincode}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('pincode', e.target.value)}
                                className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                placeholder="Pincode *"
                                maxLength={6}
                            />
                        </div>

                        <div className="relative">
                            <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="tel"
                                value={formData.mobile}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleFieldChange('mobile', e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                                placeholder="Mobile *"
                                maxLength={10}
                            />
                        </div>
                    </div>

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
                                onClick={handleCancel}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5"
                            >
                                <Check className="w-4 h-4" />
                                Save
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
                            {customer?.name || customer?.customer_name || 'Customer'}
                        </span>
                        {(formData.mobile || customer?.phone || customer?.mobile) && (
                            <span className="font-semibold text-gray-900">
                                , {formData.mobile || customer?.phone || customer?.mobile}
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

