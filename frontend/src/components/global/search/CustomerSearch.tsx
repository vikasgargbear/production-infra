import React, { forwardRef, useCallback } from 'react';
import { Building, User, Phone, MapPin, Mail, Trash2 } from 'lucide-react';
import { Customer } from '../../../types/models/customer';
import { EntitySearch, EntitySearchRef, EntitySearchProps } from './EntitySearch';
import localSearchService from '../../../services/offline/search/localSearchService';

/**
 * CustomerSearch Component Props
 * Extends EntitySearch with customer-specific options
 */
export interface CustomerSearchProps {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  onCreateNew?: () => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  showCreateButton?: boolean;
  displayMode?: 'inline' | 'compact' | 'dropdown';
  className?: string;
  renderCustomerInfo?: (customer: Customer) => React.ReactNode;
  autoFocus?: boolean;
  clearable?: boolean;
  minSearchLength?: number;
}

export interface CustomerSearchRef extends EntitySearchRef { }

/**
 * CustomerSearch - Customer-specific search component built on EntitySearch
 * 
 * This is a thin wrapper that provides:
 * - Customer-specific search function (localSearchService.searchCustomers)
 * - Customer-specific result rendering (B2B badges, contact info, GST status)
 * - Customer-specific selected state rendering
 * 
 * All the core search logic (debounce, keyboard nav, dropdown, etc.) is handled by EntitySearch
 */
export const CustomerSearch = forwardRef<CustomerSearchRef, CustomerSearchProps>((
  {
    value,
    onChange,
    onCreateNew,
    placeholder = "Search customer by name, phone, or code...",
    disabled = false,
    required = false,
    showCreateButton = true,
    displayMode = 'inline',
    className = '',
    renderCustomerInfo,
    autoFocus = false,
    clearable = true,
    minSearchLength = 2
  },
  ref
) => {
  // Memoized search function to prevent EntitySearch debounce recreation
  // This is CRITICAL - without useCallback, the searchFn changes on every render,
  // causing the debounced performSearch in EntitySearch to reset its timeout
  const searchCustomers = useCallback(async (query: string): Promise<Customer[]> => {
    const results = await localSearchService.searchCustomers(query, { limit: 20 });
    return results as Customer[];
  }, []);

  // Render customer result in dropdown - clean minimal display
  const renderCustomerResult = (customer: Customer, isHighlighted: boolean, index: number) => {
    const phone = (customer as any).contact_person?.phone ||
      customer.phone ||
      (customer as any).primary_phone;
    const city = (customer as any).billing_address?.city ||
      customer.billing_address?.city ||
      (customer as any).city;
    const hasGst = customer.gstin || (customer as any).gst_number;

    return (
      <div
        className={`p-3 cursor-pointer transition-colors ${isHighlighted
          ? 'bg-blue-50 border-l-4 border-l-blue-500'
          : 'hover:bg-gray-50 border-l-4 border-l-transparent'
          }`}
      >
        <div className="flex justify-between items-center">
          {/* Left: Name and Phone */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="font-medium text-gray-900">{customer.customer_name}</p>
              {customer.customer_type === 'B2B' && (
                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">B2B</span>
              )}
            </div>
            {phone && (
              <p className="text-sm text-gray-600 flex items-center gap-1 mt-0.5">
                <Phone className="w-3 h-3" /> {phone}
              </p>
            )}
          </div>

          {/* Right: City and GST badge */}
          <div className="flex items-center gap-2 text-right">
            {city && (
              <span className="text-xs text-gray-500">{city}</span>
            )}
            {hasGst && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                GST
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Render selected customer
  const renderSelectedCustomer = (customer: Customer, onClear: () => void) => {
    // Use custom renderer if provided
    if (renderCustomerInfo) {
      return (
        <div className="flex justify-between items-start">
          <div className="flex-1">{renderCustomerInfo(customer)}</div>
          {clearable && !disabled && (
            <button
              type="button"
              onClick={onClear}
              className="ml-3 p-1 hover:bg-gray-200 rounded"
              title="Remove customer"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          )}
        </div>
      );
    }

    // Default selected customer rendering
    return (
      <div className="bg-gray-50 rounded-lg p-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Building className="w-4 h-4 text-blue-600" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900 truncate">{customer.customer_name}</p>
                {customer.customer_type === 'B2B' && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded shrink-0">B2B</span>
                )}
                {/* GST Status Badge */}
                {(customer.gstin || (customer as any).gst_number) ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 shrink-0">
                    GST
                  </span>
                ) : (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 shrink-0">
                    No GST
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-600 mt-0.5">
                {/* Phone Number */}
                {(() => {
                  const phoneNumber = (customer as any).contact_person?.phone ||
                    customer.phone ||
                    customer.contact_info?.primary_phone ||
                    (customer as any).primary_phone;
                  if (phoneNumber) {
                    return (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {phoneNumber}
                      </span>
                    );
                  }
                  return null;
                })()}

                {/* Compact Address - City, State only */}
                {(() => {
                  const city = (customer as any).billing_address?.city ||
                    customer.billing_address?.city ||
                    (customer as any).city || '';
                  const state = (customer as any).billing_address?.state ||
                    customer.billing_address?.state ||
                    (customer as any).state || '';

                  if (city || state) {
                    return (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {city}{state ? `, ${state}` : ''}
                      </span>
                    );
                  }
                  return null;
                })()}
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
                title="Remove customer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Memoize key/label extractors to prevent unnecessary re-renders
  const getItemKey = useCallback((c: Customer) => c.customer_id, []);
  const getItemLabel = useCallback((c: Customer) => c.customer_name, []);

  return (
    <EntitySearch<Customer>
      ref={ref}
      value={value}
      onChange={onChange}
      onCreateNew={onCreateNew}
      entityType="customer"
      entityIcon={Building}
      placeholder={placeholder}
      createButtonLabel="Create New Customer"
      searchFn={searchCustomers}
      minLength={minSearchLength}
      debounceMs={100}
      renderResult={renderCustomerResult}
      renderSelected={renderSelectedCustomer}
      getItemKey={getItemKey}
      getItemLabel={getItemLabel}
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

CustomerSearch.displayName = 'CustomerSearch';