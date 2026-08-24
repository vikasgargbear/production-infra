/**
 * CustomerMaster Component
 *
 * Refactored to use useEntityMaster hook for shared CRUD logic.
 * Compact stats bar with inline search, standard Tailwind classes.
 */
import React from 'react';
import {
  Users, Search, Plus, Edit2, Trash2,
  AlertCircle, Check, Phone
} from 'lucide-react';
import { customersApi } from '../../../services/api';
import { DataTable, Column } from '../../global/ui/display/DataTable';
import { GlobalLayout, ContentCard } from '../../global';
import Button from '../../global/ui/Button';
import CustomerEditModal from '../modals/CustomerEditModal';
import CustomerFlow from '../customers/CustomerFlow';
import { useEntityMaster } from '../hooks';
import type { Customer as BaseCustomer } from '../../../types/models';

// ============================================================================
// Types
// ============================================================================

// Extended Customer with master-grid specific fields
type Customer = BaseCustomer & {
  whatsapp_number?: string;
  drug_license_validity?: string;
  credit_limit?: number;
  credit_days?: number;
  credit_rating?: string;
  current_outstanding?: number;
  customer_category?: string;
  business_type?: string;
  last_transaction_date?: string;
  total_business_amount?: number;
  address_line_1?: string;
};

// ============================================================================
// Constants
// ============================================================================

const CUSTOMER_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'retail', label: 'Retail' },
  { value: 'wholesale', label: 'Wholesale' },
  { value: 'hospital', label: 'Hospital' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'pharmacy', label: 'Pharmacy' }
];

// ============================================================================
// Helper Components
// ============================================================================

const getCreditStatus = (customer: Customer) => {
  if (!customer.credit_limit) return null;
  const utilization = (customer.current_outstanding || 0) / customer.credit_limit * 100;

  if (utilization >= 100) {
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-700">Over Limit</span>;
  } else if (utilization >= 80) {
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">Near Limit</span>;
  } else {
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-700">Good</span>;
  }
};

// ============================================================================
// Column Definitions
// ============================================================================

const getColumns = (
  handleEdit: (c: Customer) => void,
  handleDelete: (id: string | number) => Promise<void>
): Column<Customer>[] => [
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
        <div>
          <div className="flex items-center text-gray-900">
            <Phone className="w-3 h-3 mr-1" />
            {customer.primary_phone || 'N/A'}
          </div>
          {customer.primary_email && (
            <div className="text-sm text-gray-500 truncate">{customer.primary_email}</div>
          )}
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
        const gstNumber = (customer.gst_number || (customer as unknown as Record<string, unknown>).gst_number || '') as string;
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
        const creditLimit = customer.credit_limit || 0;
        const creditDays = customer.credit_days || 0;

        if (!creditLimit) return <div className="text-gray-400">No Credit</div>;

        return (
          <div>
            <div className="font-medium">₹{creditLimit.toLocaleString()}</div>
            <div className="text-sm text-gray-500">{creditDays} days</div>
            {getCreditStatus({ ...customer, credit_limit: creditLimit })}
          </div>
        );
      }
    },
    {
      key: 'current_outstanding',
      header: 'Outstanding',
      align: 'right' as const,
      render: (value) => {
        const amount = parseFloat(value || 0);
        if (!amount) return <span className="text-gray-400">-</span>;
        return <span className={`font-medium ${amount > 0 ? 'text-red-600' : 'text-green-600'}`}>₹{amount.toLocaleString()}</span>;
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
      render: (_, customer) => (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => handleEdit(customer)}
            aria-label={`Edit ${customer?.customer_name || 'customer'}`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-blue-600 hover:text-blue-700 rounded transition-colors"
            disabled={!customer}
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDelete(customer?.customer_id)}
            aria-label={`${customer?.is_active !== false ? 'Deactivate' : 'Reactivate'} ${customer?.customer_name || 'customer'}`}
            className={`${customer?.is_active !== false
              ? 'text-amber-600 hover:text-amber-700'
              : 'text-green-600 hover:text-green-700'
              } inline-flex min-h-11 min-w-11 items-center justify-center rounded transition-colors`}
            disabled={!customer?.customer_id}
            title={customer?.is_active !== false ? 'Deactivate Customer' : 'Reactivate Customer'}
          >
            {customer?.is_active !== false ? <Trash2 className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          </button>
        </div>
      )
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
    editingEntity,
    setEditingEntity,
    selectedIds,
    setSelectedIds,
    handleEdit,
    handleDelete,
    handleSaved,
    handleBulkDelete,
    searchInputRef
  } = useEntityMaster<Customer>({
    entityName: 'customer',
    idField: 'customer_id',
    nameField: 'customer_name',
    api: {
      getAll: customersApi.getAll,
      update: customersApi.update
    },
    searchFields: ['customer_name', 'customer_code', 'primary_phone', 'gst_number'],
    filterField: 'customer_type',
    softDelete: true
  });

  const columns = getColumns(handleEdit, handleDelete);

  // Summary stats
  const total = customers.length;
  const active = customers.filter(c => c.is_active !== false).length;
  const inactive = total - active;
  const totalOutstanding = customers.reduce((sum, c) => sum + (c.current_outstanding || 0), 0);

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
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-5 text-sm">
          <span className="text-gray-600">Total: <strong className="text-gray-900">{total}</strong></span>
          <span className="text-green-600">Active: <strong>{active}</strong></span>
          <span className="text-red-600">Inactive: <strong>{inactive}</strong></span>
          <span className="text-gray-600">Outstanding: <strong className="text-gray-900">₹{totalOutstanding.toLocaleString()}</strong></span>
          {selectedIds.length > 0 && (
            <Button variant="danger" size="sm" onClick={handleBulkDelete}>
              <Trash2 className="w-4 h-4 mr-2" />Deactivate ({selectedIds.length})
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search customers... ( / )"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
            />
          </div>
          <select
            aria-label="Filter customers by type"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <DataTable
            data={filteredEntities}
            columns={columns}
            keyField="customer_id"
            loading={isLoading}
            emptyMessage="No customers found"
            emptyIcon={<Users className="w-12 h-12 text-gray-400" />}
            selectable={true}
            selectedRows={filteredEntities.filter(c => selectedIds.includes(String(c.customer_id)))}
            onSelectionChange={(selected) => setSelectedIds(selected.map(c => String(c.customer_id)))}
            hoverable={true}
            striped={true}
            paginated={true}
            pageSize={20}
            searchable={false}
          />
        )}
      </ContentCard>

      {/* Canonical online create flow; legacy modal remains edit-only. */}
      {showAddModal && !editingEntity && (
        <CustomerFlow
          open={true}
          onClose={() => setShowAddModal(false)}
          onCustomerCreated={handleSaved}
        />
      )}
      {editingEntity && (
        <CustomerEditModal
          isOpen={true}
          onClose={() => {
            setShowAddModal(false);
            setEditingEntity(null);
          }}
          onSave={handleSaved}
          customer={editingEntity}
        />
      )}
    </GlobalLayout>
  );
};

export default CustomerMaster;
