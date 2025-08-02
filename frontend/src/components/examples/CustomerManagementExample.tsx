/**
 * Customer Management Example Component
 * Demonstrates all new TypeScript patterns and best practices
 */

import React, { useState, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Search, Plus, Edit2, CreditCard, AlertCircle, CheckCircle } from 'lucide-react';

// Type imports
import { Customer, CustomerCreateInput, CustomerSearchParams } from '@/types/models/customer';
import { customerCreateSchema } from '@/schemas/customer.schema';

// Hook imports
import {
  useCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useCheckCustomerCredit,
  useCustomerSelection,
} from '@/hooks/customers/useCustomers';

// Component imports
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

// Example of a type-safe sub-component
interface CustomerCardProps {
  customer: Customer;
  onEdit: (customer: Customer) => void;
  onCheckCredit: (customer: Customer) => void;
}

const CustomerCard: React.FC<CustomerCardProps> = ({ customer, onEdit, onCheckCredit }) => {
  const outstanding = customer.outstanding_balance ?? customer.current_outstanding ?? 0;
  const availableCredit = customer.credit_limit - outstanding;
  const creditUtilization = customer.credit_limit > 0 
    ? (outstanding / customer.credit_limit) * 100 
    : 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{customer.customer_name}</h3>
          <p className="text-sm text-gray-500">{customer.customer_code}</p>
        </div>
        <span className={`px-2 py-1 text-xs rounded-full ${
          customer.status === 'active' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-gray-100 text-gray-800'
        }`}>
          {customer.status}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Phone:</span>
          <span>{customer.contact_info?.primary_phone || customer.phone || 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">GST:</span>
          <span>{customer.gstin || 'N/A'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Credit Limit:</span>
          <span>₹{customer.credit_limit.toLocaleString('en-IN')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Outstanding:</span>
          <span className={outstanding > 0 ? 'text-red-600' : ''}>
            ₹{outstanding.toLocaleString('en-IN')}
          </span>
        </div>
      </div>

      {/* Credit utilization bar */}
      <div className="mt-3 mb-3">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>Credit Used</span>
          <span>{creditUtilization.toFixed(0)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              creditUtilization > 80 ? 'bg-red-500' : 
              creditUtilization > 60 ? 'bg-yellow-500' : 'bg-green-500'
            }`}
            style={{ width: `${Math.min(creditUtilization, 100)}%` }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => onEdit(customer)}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
        >
          <Edit2 className="h-3.5 w-3.5" />
          Edit
        </button>
        <button
          onClick={() => onCheckCredit(customer)}
          className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
        >
          <CreditCard className="h-3.5 w-3.5" />
          Check Credit
        </button>
      </div>
    </div>
  );
};

// Main component demonstrating all patterns
export const CustomerManagementExample: React.FC = () => {
  // State management with proper types
  const [searchParams, setSearchParams] = useState<CustomerSearchParams>({
    page: 1,
    page_size: 12,
    status: 'active',
  });
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [creditCheckAmount, setCreditCheckAmount] = useState('');

  // React Query hooks
  const { data, isLoading, error, refetch } = useCustomers(searchParams);
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const checkCredit = useCheckCustomerCredit();
  const { selectCustomer } = useCustomerSelection();

  // Form setup with Zod validation
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CustomerCreateInput>({
    resolver: zodResolver(customerCreateSchema),
    defaultValues: {
      customer_type: 'pharmacy',
      credit_limit: 50000,
      credit_days: 30,
      address_info: {
        billing_country: 'India',
      },
    },
  });

  // Memoized values
  const customers = useMemo(() => data?.data || [], [data]);
  const totalPages = useMemo(() => data?.meta?.pagination?.total_pages || 1, [data]);

  // Callbacks with proper typing
  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchParams(prev => ({
      ...prev,
      search: e.target.value,
      page: 1, // Reset to first page on search
    }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setSearchParams(prev => ({ ...prev, page }));
  }, []);

  const handleCreateCustomer = useCallback(async (data: CustomerCreateInput) => {
    try {
      const response = await createCustomer.mutateAsync(data);
      if (response.success) {
        setIsCreateModalOpen(false);
        reset();
        refetch();
        // Show success toast
        alert('Customer created successfully!');
      }
    } catch (error) {
      // Error is handled by the mutation
      console.error('Failed to create customer:', error);
    }
  }, [createCustomer, reset, refetch]);

  const handleCheckCredit = useCallback(async (customer: Customer) => {
    const amount = parseFloat(creditCheckAmount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    const result = await checkCredit.mutateAsync({
      customer_id: customer.customer_id,
      order_amount: amount,
    });

    if (result.success && result.data) {
      const { credit_status, can_proceed, message } = result.data;
      alert(`Credit Check Result: ${message}\nStatus: ${credit_status}\nCan Proceed: ${can_proceed ? 'Yes' : 'No'}`);
    }
  }, [creditCheckAmount, checkCredit]);

  // Error handling
  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <p className="text-gray-600">Failed to load customers</p>
          <button
            onClick={() => refetch()}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Customer Management</h1>
          <p className="text-gray-600 mt-1">
            TypeScript example with all new patterns
          </p>
        </div>

        {/* Search and Actions Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers..."
                onChange={handleSearch}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Credit Check Input */}
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Check amount"
                value={creditCheckAmount}
                onChange={(e) => setCreditCheckAmount(e.target.value)}
                className="w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Add Customer Button */}
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-5 w-5" />
              Add Customer
            </button>
          </div>

          {/* Active Filters */}
          <div className="flex gap-2 mt-4">
            <span className="text-sm text-gray-600">Filters:</span>
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
              Status: {searchParams.status}
            </span>
            {searchParams.search && (
              <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded">
                Search: {searchParams.search}
              </span>
            )}
          </div>
        </div>

        {/* Customer Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-gray-100 rounded-lg h-64 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customers.map((customer) => (
                <CustomerCard
                  key={customer.customer_id}
                  customer={customer}
                  onEdit={setSelectedCustomer}
                  onCheckCredit={handleCheckCredit}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                {[...Array(totalPages)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => handlePageChange(i + 1)}
                    className={`px-3 py-1 rounded ${
                      searchParams.page === i + 1
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Create Customer Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
              <h2 className="text-xl font-semibold mb-4">Add New Customer</h2>
              
              <form onSubmit={handleSubmit(handleCreateCustomer)} className="space-y-4">
                {/* Customer Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Name *
                  </label>
                  <input
                    {...register('customer_name')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                  {errors.customer_name && (
                    <p className="text-red-500 text-sm mt-1">{errors.customer_name.message}</p>
                  )}
                </div>

                {/* Customer Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Type *
                  </label>
                  <select
                    {...register('customer_type')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="pharmacy">Pharmacy</option>
                    <option value="hospital">Hospital</option>
                    <option value="clinic">Clinic</option>
                    <option value="distributor">Distributor</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Phone *
                  </label>
                  <input
                    {...register('contact_info.primary_phone')}
                    placeholder="10-digit mobile number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                  {errors.contact_info?.primary_phone && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.contact_info.primary_phone.message}
                    </p>
                  )}
                </div>

                {/* GST Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    GST Number
                  </label>
                  <input
                    {...register('gstin')}
                    placeholder="15-character GST number"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                  {errors.gstin && (
                    <p className="text-red-500 text-sm mt-1">{errors.gstin.message}</p>
                  )}
                </div>

                {/* Billing Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Billing Address *
                  </label>
                  <textarea
                    {...register('address_info.billing_address')}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                  {errors.address_info?.billing_address && (
                    <p className="text-red-500 text-sm mt-1">
                      {errors.address_info.billing_address.message}
                    </p>
                  )}
                </div>

                {/* City, State, Pincode */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <input
                      {...register('address_info.billing_city')}
                      placeholder="City *"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <input
                      {...register('address_info.billing_state')}
                      placeholder="State *"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <input
                      {...register('address_info.billing_pincode')}
                      placeholder="Pincode *"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Credit Limit and Days */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Credit Limit
                    </label>
                    <input
                      type="number"
                      {...register('credit_limit', { valueAsNumber: true })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Credit Days
                    </label>
                    <input
                      type="number"
                      {...register('credit_days', { valueAsNumber: true })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={createCustomer.isLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {createCustomer.isLoading ? (
                      <>Loading...</>
                    ) : (
                      <>
                        <CheckCircle className="h-5 w-5" />
                        Create Customer
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateModalOpen(false);
                      reset();
                    }}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

// Export with error boundary wrapper
export default CustomerManagementExample;