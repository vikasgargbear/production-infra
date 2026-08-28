/**
 * CustomerMaster Component
 *
 * Refactored to use useEntityMaster hook for shared CRUD logic.
 * Compact stats bar with inline search, standard Tailwind classes.
 */
import React from 'react';
import {
  Users, Search, Plus, AlertCircle
} from 'lucide-react';
import { customersApi, ledgerApi } from '../../../services/api';
import { DataTable, Column } from '../../global/ui/display/DataTable';
import { GlobalLayout, ContentCard } from '../../global';
import Button from '../../global/ui/Button';
import CustomerFlow from '../customers/CustomerFlow';
import { useEntityMaster } from '../hooks';
import type { Customer as BaseCustomer } from '../../../types/models';
import ContactActions from './ContactActions';
import { mergeCustomersWithCanonicalAging } from './customerAgingProjection';
import CanonicalWriteNotice from '../../global/ui/CanonicalWriteNotice';
import {
  addExactDecimals,
  compareExactDecimals,
  formatExactCurrency,
} from '../../../utils/exactDecimal';

// ============================================================================
// Types
// ============================================================================

// Extended Customer with master-grid specific fields
type Customer = Omit<BaseCustomer, 'credit_limit' | 'current_outstanding'> & {
  whatsapp_number?: string;
  drug_license_validity?: string;
  credit_limit?: string | number;
  credit_days?: number;
  credit_rating?: string;
  current_outstanding?: string | null;
  outstanding_available?: boolean;
  customer_category?: string;
  business_type?: string;
  last_transaction_date?: string;
  total_business_amount?: number;
  address_line_1?: string;
};

export const loadCustomersWithCanonicalAging = async (search = '') => {
  const customersResponse = await customersApi.getAll({ limit: 1000, search });
  const responseData = customersResponse.data as any;
  const customerRows: Customer[] = (Array.isArray(responseData)
    ? responseData
    : Array.isArray(responseData?.customers) ? responseData.customers : []) as Customer[];
  let agingRows: Record<string, unknown>[] | null = null;
  try {
    const agingResponse = await ledgerApi.getCanonicalPartyAging({ party_type: 'customer' });
    agingRows = Array.isArray(agingResponse.data?.parties) ? agingResponse.data.parties : [];
  } catch {
    agingRows = null;
  }
  return {
    ...customersResponse,
    data: mergeCustomersWithCanonicalAging(customerRows, agingRows),
  };
};

// ============================================================================
// Constants
// ============================================================================

const CUSTOMER_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'individual', label: 'Individual' },
  { value: 'organization', label: 'Organization' },
];

// ============================================================================
// Helper Components
// ============================================================================

const getCreditStatus = (customer: Customer) => {
  if (customer.credit_limit == null) {
    return <span className="text-xs text-gray-500">Credit limit unavailable</span>;
  }
  if (compareExactDecimals(
    String(customer.credit_limit),
    '0.00',
    'Customer credit limit',
    { scale: 2, maximumWholeDigits: 20, allowNegative: false },
  ) === 0) {
    return <span className="text-xs text-gray-500">No credit limit</span>;
  }
  if (customer.outstanding_available === false || customer.current_outstanding == null) {
    return <span className="text-xs text-gray-500">Balance unavailable</span>;
  }
  if (compareExactDecimals(
    customer.current_outstanding,
    String(customer.credit_limit),
    'Customer credit utilization',
    { scale: 2, maximumWholeDigits: 20, allowNegative: false },
  ) > 0) {
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">Over Limit</span>;
  }
  return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">Within Limit</span>;
};

// ============================================================================
// Column Definitions
// ============================================================================

const getColumns = (): Column<Customer>[] => [
    {
      key: 'customer_name',
      header: 'Customer',
      render: (_, customer) => customer ? (
        <div>
          <div className="font-medium text-gray-900">{customer.customer_name || 'N/A'}</div>
          <div className="text-sm text-gray-500">{customer.customer_code || `ID: ${customer.customer_id}`}</div>
        </div>
      ) : <div>N/A</div>
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (_, customer) => customer ? (
        <div className="space-y-1">
          <div className="text-sm text-gray-700">{customer.primary_phone || customer.primary_email || 'No contact details'}</div>
          <ContactActions
            name={customer.customer_name || 'customer'}
            phone={customer.primary_phone}
            email={customer.primary_email}
            whatsapp={customer.whatsapp_number}
          />
        </div>
      ) : <div>N/A</div>
    },
    {
      key: 'customer_type',
      header: 'Type',
      render: (value) => (
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
          {value || 'N/A'}
        </span>
      )
    },
    {
      key: 'gst_number',
      header: 'GST/License',
      render: (_, customer) => {
        if (!customer) return <div>N/A</div>;
        const gstNumber = customer.gst_number;
        return (
          <div className="text-sm">
            {gstNumber ? (
              <div className="text-gray-900">{String(gstNumber)}</div>
            ) : (
              <div className="text-gray-400">No GST</div>
            )}
            {customer.drug_license_number && (
              <div className="text-gray-500">DL: {customer.drug_license_number}</div>
            )}
          </div>
        );
      }
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right' as const,
      render: (_, customer) => {
        if (!customer) return <div className="text-gray-400">No Credit</div>;
        const creditLimit = customer.credit_limit;
        const creditDays = customer.credit_days;

        if (creditLimit == null || creditDays == null) {
          return <div className="text-gray-500">Unavailable</div>;
        }

        return (
          <div>
            <div className="font-medium">{formatExactCurrency(String(creditLimit), 'Customer credit limit')}</div>
            <div className="text-sm text-gray-500">{creditDays} days</div>
            {getCreditStatus(customer)}
          </div>
        );
      }
    },
    {
      key: 'current_outstanding',
      header: 'Outstanding',
      align: 'right' as const,
      render: (value, customer) => {
        if (customer.outstanding_available === false || value == null) {
          return <span className="text-gray-500">Unavailable</span>;
        }
        const isPositive = compareExactDecimals(
          String(value), '0.00', 'Customer outstanding',
          { scale: 2, maximumWholeDigits: 20, allowNegative: false },
        ) > 0;
        return <span className={`font-medium ${isPositive ? 'text-red-600' : 'text-green-600'}`}>{formatExactCurrency(String(value), 'Customer outstanding')}</span>;
      }
    },
    {
      key: 'is_active',
      header: 'Status',
      align: 'center' as const,
      render: (value) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${value !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
          {value !== false ? 'Active' : 'Inactive'}
        </span>
      )
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center' as const,
      sortable: false,
      render: () => (
        <span className="text-sm text-gray-500" title="A canonical customer edit command is not available">
          Read only
        </span>
      ),
    }
  ];

// ============================================================================
// Main Component
// ============================================================================

const CustomerMaster: React.FC = () => {
  // Use the shared hook for all CRUD operations
  const {
    entities: customers,
    filteredEntities,
    isLoading,
    error,
    searchTerm,
    setSearchTerm,
    filterValue,
    setFilterValue,
    showAddModal,
    setShowAddModal,
    handleSaved,
    searchInputRef
  } = useEntityMaster<Customer>({
    entityName: 'customer',
    idField: 'customer_id',
    nameField: 'customer_name',
    api: {
      getAll: loadCustomersWithCanonicalAging,
      update: customersApi.update
    },
    searchFields: ['customer_name', 'customer_code', 'primary_phone', 'gst_number'],
    filterField: 'customer_type',
    serverSearch: true,
    softDelete: true
  });

  const columns = getColumns();

  // Summary stats
  const total = customers.length;
  const active = customers.filter(c => c.is_active !== false).length;
  const inactive = total - active;
  const outstandingAvailable = !isLoading && !error
    && customers.every(customer => customer.outstanding_available !== false);
  const totalOutstanding = outstandingAvailable
    ? addExactDecimals(
      customers
        .map(customer => customer.current_outstanding)
        .filter((value): value is string => typeof value === 'string'),
      'Customer outstanding total',
      { scale: 2, maximumWholeDigits: 20, allowNegative: false },
    )
    : null;

  const headerActions = (
    <Button variant="primary" onClick={() => setShowAddModal(true)}>
      <Plus className="w-4 h-4 mr-2" />Add Customer
    </Button>
  );

  return (
    <GlobalLayout
      title="Customer Master"
      subtitle="Manage your customer database"
      icon={Users}
      headerActions={headerActions}
    >
      {/* Stats Bar with Inline Search */}
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm sm:px-5">
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <span className="text-gray-600">Total: <strong className="text-gray-900">{total}</strong></span>
          <span className="text-green-600">Active: <strong>{active}</strong></span>
          <span className="text-red-600">Inactive: <strong>{inactive}</strong></span>
          <span className="text-gray-600">Outstanding: <strong className="text-gray-900">{totalOutstanding == null ? 'Unavailable' : formatExactCurrency(totalOutstanding, 'Customer outstanding total')}</strong></span>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative min-w-0">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              ref={searchInputRef}
              type="text"
              aria-label="Search customers"
              placeholder="Search customers... ( / )"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-gray-300 py-1.5 pl-9 pr-3 text-base focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            aria-label="Filter customers by type"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-1.5 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto"
          >
            {CUSTOMER_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <CanonicalWriteNotice
        action="Editing customers or changing customer status"
        description="New customer accounts use the canonical API. Existing customer edits and status changes remain unavailable until their reviewed cloud commands exist."
      />

      {/* Customer List */}
      <ContentCard title="Customer List" subtitle={undefined} actions={undefined} className="overflow-hidden" icon={Users}>
        {customers.length === 0 && !isLoading ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No customers found</h3>
            <p className="text-sm text-gray-500 mb-4">Get started by adding your first customer</p>
            <Button variant="primary" onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4 mr-2" />Add Your First Customer
            </Button>
          </div>
        ) : (
          <>
          <div className="space-y-3 p-4 md:hidden">
            {filteredEntities.map(customer => (
              <article key={String(customer.customer_id)} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><h4 className="truncate font-semibold text-gray-950">{customer.customer_name}</h4><p className="mt-1 text-xs text-gray-500">{customer.customer_code}</p></div>
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${customer.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{customer.is_active !== false ? 'Active' : 'Inactive'}</span>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-gray-500">Outstanding</dt><dd className="mt-1 font-semibold text-red-700">{customer.outstanding_available === false || customer.current_outstanding == null ? 'Unavailable' : formatExactCurrency(customer.current_outstanding, 'Customer outstanding')}</dd></div>
                  <div><dt className="text-gray-500">Credit terms</dt><dd className="mt-1 font-medium">{customer.credit_limit == null || customer.credit_days == null ? 'Unavailable' : `${formatExactCurrency(String(customer.credit_limit), 'Customer credit limit')} · ${customer.credit_days} days`}</dd></div>
                </dl>
                <div className="mt-4 border-t border-gray-100 pt-3"><p className="mb-2 text-xs text-gray-500">{customer.primary_phone || customer.primary_email || 'No contact details'}</p><ContactActions name={customer.customer_name || 'customer'} phone={customer.primary_phone} email={customer.primary_email} whatsapp={customer.whatsapp_number} /></div>
              </article>
            ))}
          </div>
          <div className="hidden md:block">
          <DataTable
            data={filteredEntities}
            columns={columns}
            keyField="customer_id"
            loading={isLoading}
            emptyMessage="No customers found"
            emptyIcon={<Users className="w-12 h-12 text-gray-400" />}
            selectable={false}
            hoverable={true}
            striped={true}
            paginated={true}
            pageSize={20}
            searchable={false}
          />
          </div>
          </>
        )}
      </ContentCard>

      {/* Canonical online create flow; unsupported edits are not rendered. */}
      {showAddModal && (
        <CustomerFlow
          open={true}
          onClose={() => setShowAddModal(false)}
          onCustomerCreated={handleSaved}
        />
      )}
    </GlobalLayout>
  );
};

export default CustomerMaster;
