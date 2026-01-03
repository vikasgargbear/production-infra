/**
 * SupplierMaster Component
 * 
 * Refactored to use useEntityMaster hook for shared CRUD logic.
 * Reduced from 482 lines to ~280 lines.
 */
import React from 'react';
import {
  Truck, Search, Plus, Edit2, Trash2,
  Download, Upload, AlertCircle, Check,
  Phone, AlertTriangle
} from 'lucide-react';
import { suppliersApi } from '../../services/api';
import { DataTable, Column } from '../global/ui/display/DataTable';
import { GlobalLayout, ContentCard } from '../global';
import Button from '../global/ui/Button';
import Input from '../global/ui/forms/Input';
import SupplierEditModal from './SupplierEditModal';
import { useEntityMaster } from './hooks';

// ============================================================================
// Types
// ============================================================================

interface Supplier {
  supplier_id: number;
  supplier_code?: string;
  supplier_name: string;
  supplier_type?: string;
  primary_phone: string;
  primary_email?: string;
  whatsapp_number?: string;
  gst_number?: string;
  gstin?: string;
  pan_number?: string;
  drug_license_number?: string;
  drug_license_validity?: string;
  payment_days?: number;
  payment_terms?: string;
  supplier_category?: string;
  is_active?: boolean;
  created_at?: string;
  last_transaction_date?: string;
  total_business_amount?: number;
  address_line_1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  current_outstanding?: number;
}

// ============================================================================
// Constants
// ============================================================================

const SUPPLIER_TYPES = [
  { value: 'all', label: 'All Types' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'wholesaler', label: 'Wholesaler' },
  { value: 'stockist', label: 'Stockist' },
  { value: 'cnf', label: 'C&F Agent' }
];

// ============================================================================
// Helper Functions
// ============================================================================

const getPaymentTermsBadge = (supplier: Supplier) => {
  const days = supplier.payment_days || 0;

  if (days === 0) {
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">COD</span>;
  } else if (days <= 7) {
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Net {days}</span>;
  } else if (days <= 30) {
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">Net {days}</span>;
  } else {
    return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800">Net {days}</span>;
  }
};

const getLicenseStatus = (expiryDate?: string) => {
  if (!expiryDate) return null;

  const today = new Date();
  const expiry = new Date(expiryDate);
  const daysToExpiry = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysToExpiry < 0) {
    return <span className="text-xs text-red-600">Expired</span>;
  } else if (daysToExpiry <= 30) {
    return <span className="text-xs text-yellow-600">{daysToExpiry}d left</span>;
  } else {
    return <span className="text-xs text-green-600">Valid</span>;
  }
};

// ============================================================================
// Column Definitions
// ============================================================================

const getColumns = (
  handleEdit: (s: Supplier) => void,
  handleDelete: (id: string | number) => Promise<void>
): Column<Supplier>[] => [
    {
      key: 'supplier_name',
      header: 'Supplier',
      render: (_, supplier) => supplier ? (
        <div>
          <div className="font-medium text-app-800">{supplier.supplier_name || 'N/A'}</div>
          <div className="text-sm text-app-500">{supplier.supplier_code || `ID: ${supplier.supplier_id}`}</div>
        </div>
      ) : <div>N/A</div>
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (_, supplier) => supplier ? (
        <div>
          <div className="flex items-center text-app-800">
            <Phone className="w-3 h-3 mr-1" />
            {supplier.primary_phone || 'N/A'}
          </div>
          {supplier.primary_email && (
            <div className="text-sm text-app-500 truncate">{supplier.primary_email}</div>
          )}
        </div>
      ) : <div>N/A</div>
    },
    {
      key: 'supplier_type',
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
      render: (_, supplier) => {
        if (!supplier) return <div>N/A</div>;
        const gstNumber = supplier.gst_number || supplier.gstin;
        return (
          <div className="text-sm">
            {gstNumber ? (
              <div className="text-app-800">{gstNumber}</div>
            ) : (
              <div className="text-app-400">No GST</div>
            )}
            {supplier.drug_license_number && (
              <div className="text-app-500">
                DL: {supplier.drug_license_number} {getLicenseStatus(supplier.drug_license_validity)}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: 'payment',
      header: 'Payment',
      align: 'right' as const,
      render: (_, supplier) => {
        if (!supplier) return <div className="text-app-400">N/A</div>;
        return (
          <div>
            {getPaymentTermsBadge(supplier)}
            {supplier.current_outstanding && supplier.current_outstanding > 0 && (
              <div className="text-sm text-app-500 mt-1">
                Due: ₹{supplier.current_outstanding.toLocaleString()}
              </div>
            )}
          </div>
        );
      }
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
      render: (_, supplier) => (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => handleEdit(supplier)}
            className="text-primary-600 hover:text-primary-700 p-1 rounded transition-colors"
            disabled={!supplier}
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDelete(supplier?.supplier_id)}
            className={`${supplier?.is_active !== false
                ? 'text-warning-600 hover:text-warning-700'
                : 'text-success-600 hover:text-success-700'
              } p-1 rounded transition-colors`}
            disabled={!supplier?.supplier_id}
            title={supplier?.is_active !== false ? 'Deactivate Supplier' : 'Reactivate Supplier'}
          >
            {supplier?.is_active !== false ? (
              supplier?.current_outstanding && supplier.current_outstanding > 0
                ? <AlertTriangle className="w-4 h-4" />
                : <Trash2 className="w-4 h-4" />
            ) : <Check className="w-4 h-4" />}
          </button>
        </div>
      )
    }
  ];

// ============================================================================
// Main Component
// ============================================================================

const SupplierMaster: React.FC = () => {
  // Use the shared hook for all CRUD operations
  const {
    entities: suppliers,
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
  } = useEntityMaster<Supplier>({
    entityName: 'supplier',
    idField: 'supplier_id',
    nameField: 'supplier_name',
    api: {
      getAll: suppliersApi.getAll,
      update: suppliersApi.update
    },
    searchFields: ['supplier_name', 'supplier_code', 'primary_phone', 'gst_number', 'gstin'],
    filterField: 'supplier_type',
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
        <Plus className="w-4 h-4 mr-2" />Add Supplier
      </Button>
    </>
  );

  return (
    <GlobalLayout
      title="Supplier Master"
      subtitle="Manage your supplier network"
      icon={Truck}
      headerActions={headerActions}
    >
      {/* Filters and Search */}
      <ContentCard
        title="Search & Filter"
        subtitle={null}
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
              placeholder="Search suppliers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12"
            />
          </div>
          <select
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SUPPLIER_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
      </ContentCard>

      {/* Error Message */}
      {error && (
        <ContentCard title="" subtitle={null} actions={null} className="border-l-4 border-l-red-500 bg-red-50" icon={AlertCircle}>
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        </ContentCard>
      )}

      {/* Supplier List */}
      <ContentCard title="Supplier List" subtitle={null} actions={null} className="overflow-hidden" icon={Truck}>
        {suppliers.length === 0 && !isLoading ? (
          <div className="text-center py-12">
            <Truck className="w-12 h-12 text-app-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No suppliers found</h3>
            <p className="text-sm text-gray-500 mb-4">Get started by adding your first supplier</p>
            <Button variant="primary" onClick={() => setShowAddModal(true)}>
              <Plus className="w-4 h-4 mr-2" />Add Your First Supplier
            </Button>
          </div>
        ) : (
          <DataTable
            data={filteredEntities}
            columns={columns}
            keyField="supplier_id"
            loading={isLoading}
            emptyMessage="No suppliers found"
            emptyIcon={<Truck className="w-12 h-12 text-app-400" />}
            selectable={true}
            selectedRows={filteredEntities.filter(s => selectedIds.includes(String(s.supplier_id)))}
            onSelectionChange={(selected) => setSelectedIds(selected.map(s => String(s.supplier_id)))}
            hoverable={true}
            striped={true}
            paginated={true}
            pageSize={20}
            searchable={false}
          />
        )}
      </ContentCard>

      {/* Supplier Edit/Add Modal */}
      {(showAddModal || editingEntity) && (
        <SupplierEditModal
          isOpen={true}
          onClose={() => {
            setShowAddModal(false);
            setEditingEntity(null);
          }}
          onSave={handleSaved}
          supplier={editingEntity}
        />
      )}
    </GlobalLayout>
  );
};

export default SupplierMaster;