/**
 * Customer Search Component - Using PostgreSQL Functions
 * Searches using api.search_customers() through REST wrapper
 */

import React, { useState, useCallback } from 'react';
import { useQuery } from 'react-query';
import { debounce } from 'lodash';
import { customerAPI } from '../../../services/api/apiClient';
import { Input } from '../ui/Input';
import { Spinner } from '../ui/Spinner';

interface Customer {
  customer_id: number;
  customer_name: string;
  customer_code: string;
  phone: string;
  email?: string;
  gst_number?: string;
  outstanding_balance?: number;
  credit_limit?: number;
}

interface CustomerSearchProps {
  onSelect: (customer: Customer) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export const CustomerSearchV2: React.FC<CustomerSearchProps> = ({
  onSelect,
  placeholder = "Search customer by name, phone, or code...",
  className = "",
  autoFocus = false,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      setDebouncedSearchTerm(value);
    }, 300),
    []
  );

  // Query using new PostgreSQL wrapper
  const { data, isLoading, error } = useQuery(
    ['customers', 'search', debouncedSearchTerm],
    () => customerAPI.search(debouncedSearchTerm),
    {
      enabled: debouncedSearchTerm.length >= 2,
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
    }
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchTerm(value);
    debouncedSearch(value);
    setIsOpen(true);
  };

  const handleSelectCustomer = (customer: Customer) => {
    setSearchTerm(customer.customer_name);
    setIsOpen(false);
    onSelect(customer);
  };

  const customers = data?.customers || [];

  return (
    <div className={`relative ${className}`}>
      <Input
        type="text"
        value={searchTerm}
        onChange={handleInputChange}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full"
      />

      {isOpen && searchTerm.length >= 2 && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-md shadow-lg max-h-60 overflow-auto">
          {isLoading ? (
            <div className="p-4 text-center">
              <Spinner size="sm" />
              <span className="ml-2 text-sm text-gray-600">Searching...</span>
            </div>
          ) : error ? (
            <div className="p-4 text-center text-red-600">
              Error loading customers
            </div>
          ) : customers.length === 0 ? (
            <div className="p-4 text-center text-gray-600">
              No customers found
            </div>
          ) : (
            <ul className="py-1">
              {customers.map((customer) => (
                <li
                  key={customer.customer_id}
                  onClick={() => handleSelectCustomer(customer)}
                  className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                >
                  <div className="flex justify-between">
                    <div>
                      <div className="font-medium text-gray-900">
                        {customer.customer_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        {customer.customer_code} • {customer.phone}
                      </div>
                    </div>
                    {customer.outstanding_balance !== undefined && (
                      <div className="text-right">
                        <div className="text-sm text-gray-600">Outstanding</div>
                        <div className="font-medium text-red-600">
                          ₹{customer.outstanding_balance.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                  {customer.gst_number && (
                    <div className="text-xs text-gray-500 mt-1">
                      GST: {customer.gst_number}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};