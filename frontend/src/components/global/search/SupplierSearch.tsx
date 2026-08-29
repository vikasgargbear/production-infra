import React, { forwardRef, useCallback } from 'react';
import { Building2, Phone, MapPin, UserPlus, Trash2 } from 'lucide-react';
import { EntitySearch, EntitySearchRef } from './EntitySearch';
import { suppliersApi } from '../../../services/api';

/**
 * Supplier interface for type safety
 */
export interface Supplier {
    supplier_id?: number | string;
    id?: number | string;
    supplier_name?: string;
    name?: string;
    supplier_code?: string;
    primary_phone?: string;
    contact_person_phone?: string;
    phone?: string;
    primary_email?: string;
    email?: string;
    gst_number?: string;
    pan_number?: string;
    city?: string;
    state?: string;
    address?: string;
    contact_person?: string;
    contact_person_email?: string;
}

/**
 * SupplierSearch Component Props
 */
export interface SupplierSearchProps {
    value?: Supplier | null;
    onChange: (supplier: Supplier | null) => void;
    onCreateNew?: (searchQuery?: string) => void;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    showCreateButton?: boolean;
    displayMode?: 'inline' | 'compact' | 'dropdown';
    className?: string;
    autoFocus?: boolean;
    clearable?: boolean;
    buttonLabel?: string;
}

export interface SupplierSearchRef extends EntitySearchRef { }

/**
 * SupplierSearch - Supplier-specific search component built on EntitySearch
 * 
 * This is a thin wrapper that provides:
 * - Supplier-specific search function using the canonical API
 * - Supplier-specific result rendering (contact person, GST status)
 * - Supplier-specific selected state rendering
 * 
 * Core search logic is handled by EntitySearch
 */
export const SupplierSearch = forwardRef<SupplierSearchRef, SupplierSearchProps>((
    {
        value = null,
        onChange,
        onCreateNew,
        placeholder = "Search supplier by name, phone, or code...",
        disabled = false,
        required = false,
        showCreateButton = true,
        displayMode = 'inline',
        className = '',
        autoFocus = false,
        clearable = true,
        buttonLabel = 'Create Supplier'
    },
    ref
) => {
    const searchSuppliers = useCallback(async (query: string, signal: AbortSignal): Promise<Supplier[]> => {
        const response = await suppliersApi.search(query, { limit: 20 }, { signal });
        const rows = response?.data;
        if (!Array.isArray(rows)) {
            throw new Error('Supplier search returned an invalid canonical response');
        }
        return rows as Supplier[];
    }, []);

    // Render supplier result in dropdown
    const renderSupplierResult = (supplier: Supplier, isHighlighted: boolean, index: number) => (
        <div
            className={`p-3 cursor-pointer transition-colors ${isHighlighted
                ? 'bg-blue-50 border-l-4 border-l-blue-500'
                : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                }`}
        >
            <div className="flex justify-between items-start">
                <div>
                    <div className="font-medium text-gray-900">
                        {supplier.supplier_name || supplier.name}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                        {(supplier.primary_phone || supplier.phone) && (
                            <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                {supplier.primary_phone || supplier.phone}
                            </span>
                        )}
                        {supplier.gst_number && (
                            <span className="ml-2">GST: {supplier.gst_number}</span>
                        )}
                    </div>
                    {supplier.contact_person && (
                        <div className="text-xs text-gray-500 mt-1">
                            Contact: {supplier.contact_person}
                        </div>
                    )}
                </div>
                {supplier.gst_number && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                        GST
                    </span>
                )}
            </div>
        </div>
    );

    // Render selected supplier
    const renderSelectedSupplier = (supplier: Supplier, onClear: () => void) => (
        <div className="bg-gray-50 rounded-lg p-2">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900 truncate">
                                {supplier.supplier_name || supplier.name}
                            </p>
                            {/* GST Status Badge */}
                            {supplier.gst_number ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 shrink-0">
                                    GST
                                </span>
                            ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 shrink-0">
                                    No GST
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 mt-0.5">
                            {/* Contact Person */}
                            {supplier.contact_person && (
                                <span className="flex items-center gap-1">
                                    <UserPlus className="w-3 h-3" /> {supplier.contact_person}
                                </span>
                            )}
                            {/* Phone Number */}
                            {(supplier.primary_phone || supplier.contact_person_phone || supplier.phone) && (
                                <span className="flex items-center gap-1">
                                    <Phone className="w-3 h-3" />
                                    {supplier.primary_phone || supplier.contact_person_phone || supplier.phone}
                                </span>
                            )}
                            {/* Compact Address - City, State only */}
                            {(supplier.city || supplier.state) && (
                                <span className="flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {supplier.city}{supplier.state ? `, ${supplier.state}` : ''}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Delete Icon */}
                {clearable && !disabled && (
                    <div className="flex items-center justify-center min-h-[3rem]">
                        <button
                            type="button"
                            onClick={onClear}
                            className="p-3 hover:bg-red-50 rounded-full text-red-500 hover:text-red-600 transition-colors shrink-0"
                            title="Remove supplier"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <EntitySearch<Supplier>
            ref={ref}
            value={value}
            onChange={onChange}
            onCreateNew={onCreateNew}
            entityType="supplier"
            entityIcon={Building2}
            placeholder={placeholder}
            createButtonLabel={buttonLabel}
            searchFn={searchSuppliers}
            minLength={2}
            debounceMs={275}
            renderResult={renderSupplierResult}
            renderSelected={renderSelectedSupplier}
            getItemKey={(s) => s.supplier_id || s.id || ''}
            getItemLabel={(s) => s.supplier_name || s.name || ''}
            displayMode={displayMode}
            showCreateButton={showCreateButton}
            required={required}
            clearable={clearable}
            disabled={disabled}
            autoFocus={autoFocus}
            className={className}
        />
    );
});

SupplierSearch.displayName = 'SupplierSearch';

export default SupplierSearch;
