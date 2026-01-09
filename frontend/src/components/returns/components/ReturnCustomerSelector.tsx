/**
 * ReturnCustomerSelector Component
 * Customer search and selection for sales returns
 * Optimized with React.memo
 */

import React, { useCallback } from 'react';
import { User, Plus } from 'lucide-react';
import { CustomerSearch } from '../../global';
import CustomerCreationB2B from '../../global/creation/CustomerCreationB2B';
import type { ReturnCustomerSelectorProps } from '../types/return.types';

export const ReturnCustomerSelector = React.memo<ReturnCustomerSelectorProps>(({
    selectedCustomer,
    onCustomerSelect,
    onCreateCustomer,
    customerSearchRef
}) => {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    CUSTOMER
                </h3>
                <div className="flex items-center space-x-3">
                    <div className="flex-1">
                        <CustomerSearch
                            ref={customerSearchRef}
                            value={selectedCustomer}
                            onChange={onCustomerSelect}
                            placeholder="Search customer by name, phone, or code... (Ctrl+R)"
                            size="lg"
                            autoFocus
                            showCreateButton={false}
                        />
                    </div>
                    <button
                        onClick={onCreateCustomer}
                        className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                        title="Create new customer"
                    >
                        <Plus className="w-4 h-4" />
                        <span>New</span>
                    </button>
                </div>

                {selectedCustomer && (
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                                <span className="font-medium text-gray-700">Phone:</span>{' '}
                                <span className="text-gray-900">{selectedCustomer.phone || selectedCustomer.mobile || 'N/A'}</span>
                            </div>
                            <div>
                                <span className="font-medium text-gray-700">GST:</span>{' '}
                                <span className="text-gray-900">{selectedCustomer.gst_number || 'N/A'}</span>
                            </div>
                            <div>
                                <span className="font-medium text-gray-700">Address:</span>{' '}
                                <span className="text-gray-900">
                                    {selectedCustomer.address || selectedCustomer.city || 'N/A'}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

ReturnCustomerSelector.displayName = 'ReturnCustomerSelector';
