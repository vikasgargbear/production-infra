/**
 * CustomerMaster Component
 * 
 * Refactored to use useEntityMaster hook for shared CRUD logic.
 * Reduced from 484 lines to ~200 lines.
 */
import React from 'react';
import {
  Users, Search, Plus, Edit2, Trash2,
  Download, Upload, AlertCircle, Check,
  Phone, CreditCard, Award
} from 'lucide-react';
import { customersApi } from '../../../services/api';
import { DataTable, Column } from '../../global/ui/display/DataTable';
import { GlobalLayout, ContentCard } from '../../global';
import Button from '../../global/ui/Button';
import Input from '../../global/ui/forms/Input';
import CustomerEditModal from '../modals/CustomerEditModal';
import { useEntityMaster } from '../hooks';

// ============================================================================
// Types
// ============================================================================

interface Customer {
  customer_id: number;
  customer_name: string;
  customer_code?: string;
  customer_type?: string;
  primary_phone: string;
  primary_email?: string;
  whatsapp_number?: string;
  gst_number?: string;
  pan_number?: string;
  drug_license_number?: string;
  drug_license_validity?: string;
  credit_limit?: number;
  credit_days?: number;
  credit_rating?: string;
  current_outstanding?: number;
  customer_category?: string;
  business_type?: string;
  is_active?: boolean;
  created_at?: string;
  last_transaction_date?: string;
  total_business_amount?: number;
  loyalty_tier?: string;
  loyalty_points?: number;
  address_line_1?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

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
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-danger-100 text-danger-800">Over Limit</span>;
  } else if (utilization >= 80) {
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-warning-100 text-warning-800">Near Limit</span>;
  } else {
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-success-100 text-success-800">Good</span>;
  }
};

const getLoyaltyBadge = (tier?: string) => {
  const colors: Record<string, string> = {
    'platinum': 'bg-purple-100 text-purple-800',
    'gold': 'bg-yellow-100 text-yellow-800',
    'silver': 'bg-gray-100 text-gray-800',
    'bronze': 'bg-orange-100 text-orange-800'
  };

  if (!tier) return null;
  return (
    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${colors[tier.toLowerCase()] || 'bg-gray-100 text-gray-800'}`}>
      {tier}
    </span>
  );
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
          <div className="font-medium text-app-800">{customer.customer_name || 'N/A'}</div>
          <div className="text-sm text-app-500">{customer.customer_code || `ID: ${customer.customer_id}`}</div>
        </div>
      ) : <div>N/A</div>
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (_, customer) => customer ? (
        <div>
          <div className="flex items-center text-app-800">
            <Phone className="w-3 h-3 mr-1" />
            {customer.primary_phone || 'N/A'}
          </div>
          {customer.primary_email && (
            <div className="text-sm text-app-500 truncate">{customer.primary_email}</div>
          )}
        </div>
      ) : <div>N/A</div>
    },
    {
      key: 'customer_type',
      header: 'Type',
      render: (value) => (
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-primary-100 text-primary-800">
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
              <div className="text-app-800">{String(gstNumber)}</div>
            ) : (
              <div className="text-app-400">No GST</div>
            )}
            {customer.drug_license_number && (
              <div className="text-app-500">DL: {customer.drug_license_number}</div>
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
        if (!customer) return <div className="text-app-400">No Credit</div>;
        const creditLimit = customer.credit_limit || 0;
        const creditDays = customer.credit_days || 0;

        if (!creditLimit) return <div className="text-app-400">No Credit</div>;

        return (
          <div>
            <div className="font-medium">₹{creditLimit.toLocaleString()}</div>
            <div className="text-sm text-app-500">{creditDays} days</div>
            {getCreditStatus({ ...customer, credit_limit: creditLimit })}
          </div>
        );
      }
    },
    {
      key: 'loyalty_tier',
      header: 'Loyalty',
      align: 'center' as const,
      render: (value) => getLoyaltyBadge(value)
    },
    {
      key: 'is_active',
      header: 'Status',
      align: 'center' as const,
      render: (value) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${value !== false ? 'bg-success-100 text-success-800' : 'bg-danger-100 text-danger-800'
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
            className="text-primary-600 hover:text-primary-700 p-1 rounded transition-colors"
            disabled={!customer}
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDelete(customer?.customer_id)}
            className={`${customer?.is_active !== false
              ? 'text-warning-600 hover:text-warning-700'
              : 'text-success-600 hover:text-success-700'
              } p-1 rounded transition-colors`}
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
    handleBulkDelete
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

  const headerActions = (
    <>
      <Button variant="secondary" size="sm" onClick={() => {/* Import logic */ }}>
        <Upload className="w-4 h-4 mr-2" />Import
      </Button>
      <Button variant="secondary" size="sm" onClick={() => {/* Export logic */ }}>
        <Download className="w-4 h-4 mr-2" />Export
      </Button>
      <Button variant="primary" onClick={() => setShowAddModal(true)}>
        <Plus className="w-4 h-4 mr-2" />Add Customer
      </Button>
    </>
  );

  return (
    <GlobalLayout
      title="Customer Master"
      subtitle="Manage your customer database"
      icon={Users}
      headerActions={headerActions}
    >
      {/* Filters and Search */}
      <ContentCard
        title="Search & Filter"
        subtitle={undefined}
        actions={selectedIds.length > 0 ? (
          <Button variant="danger" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="w-4 h-4 mr-2" />Deactivate ({selectedIds.length})
          </Button>
        ) : null}
        icon={Search}
      >
        <div className="flex items-center space-x-6">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-app-400 w-5 h-5" />
            <Input
              type="text"
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12"
            />
          </div>
          <select
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CUSTOMER_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
      </ContentCard>

      {/* Error Message */}
      {error && (
        <ContentCard title="" subtitle={undefined} actions={undefined} className="border-l-4 border-l-red-500 bg-red-50" icon={AlertCircle}>
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        </ContentCard>
      )}

      {/* Customer List */}
      <ContentCard title="Customer List" subtitle={undefined} actions={undefined} className="overflow-hidden" icon={Users}>
        {customers.length === 0 && !isLoading ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-app-400 mx-auto mb-4" />
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
            emptyIcon={<Users className="w-12 h-12 text-app-400" />}
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

      {/* Customer Edit/Add Modal */}
      {(showAddModal || editingEntity) && (
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