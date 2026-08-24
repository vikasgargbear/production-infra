/**
 * SupplierMaster Component
 *
 * Refactored to use useEntityMaster hook for shared CRUD logic.
 * Reduced from 482 lines to ~280 lines.
 */
import React from 'react';
import {
  Truck, Search, Plus, AlertCircle
} from 'lucide-react';
import { suppliersApi } from '../../../services/api';
import { DataTable, Column } from '../../global/ui/display/DataTable';
import { GlobalLayout, ContentCard } from '../../global';
import Button from '../../global/ui/Button';
import SupplierFlow from '../suppliers/SupplierFlow';
import { useEntityMaster } from '../hooks';
import ContactActions from './ContactActions';
import CanonicalWriteNotice from '../../global/ui/CanonicalWriteNotice';
import { withoutUnownedSupplierOutstanding } from './supplierProjection';

// ============================================================================
// Types
// ============================================================================

interface Supplier {
  supplier_id: number | string;
  supplier_code?: string;
  supplier_name: string;
  supplier_type?: string;
  primary_phone: string;
  primary_email?: string;
  whatsapp_number?: string;
  gst_number?: string;
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
  current_outstanding?: number | string | null;
  outstanding?: number | string | null;
  outstanding_available?: boolean;
}

export const loadCanonicalSuppliers = async () => {
  const response = await suppliersApi.getAll();
  const rows = Array.isArray(response.data)
    ? response.data
    : Array.isArray(response.data?.suppliers) ? response.data.suppliers : [];
  return { ...response, data: rows.map(withoutUnownedSupplierOutstanding) };
};

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

const getColumns = (): Column<Supplier>[] => [
    {
      key: 'supplier_name',
      header: 'Supplier',
      render: (_, supplier) => supplier ? (
        <div>
          <div className="font-medium text-gray-900">{supplier.supplier_name || 'N/A'}</div>
          <div className="text-sm text-gray-500">{supplier.supplier_code || `ID: ${supplier.supplier_id}`}</div>
        </div>
      ) : <div>N/A</div>
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (_, supplier) => supplier ? (
        <div className="space-y-1">
          <div className="text-sm text-gray-700">{supplier.primary_phone || supplier.primary_email || 'No contact details'}</div>
          <ContactActions
            name={supplier.supplier_name || 'supplier'}
            phone={supplier.primary_phone}
            email={supplier.primary_email}
            whatsapp={supplier.whatsapp_number}
          />
        </div>
      ) : <div>N/A</div>
    },
    {
      key: 'supplier_type',
      header: 'Type',
      render: (value) => (
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
          {value || 'N/A'}
        </span>
      )
    },
    {
      key: 'outstanding',
      header: 'Payable',
      align: 'right' as const,
      render: (_, supplier) => {
        if (supplier?.outstanding_available === false) {
          return <span className="text-gray-500">Unavailable</span>;
        }
        const amount = parseFloat(String(supplier?.current_outstanding || supplier?.outstanding || 0));
        if (!amount) return <span className="text-gray-400">-</span>;
        return <span className="font-medium text-red-600">{'\u20B9'}{amount.toLocaleString()}</span>;
      }
    },
    {
      key: 'gst_number',
      header: 'GST/License',
      render: (_, supplier) => {
        if (!supplier) return <div>N/A</div>;
        const gstNumber = supplier.gst_number;
        return (
          <div className="text-sm">
            {gstNumber ? (
              <div className="text-gray-900">{gstNumber}</div>
            ) : (
              <div className="text-gray-400">No GST</div>
            )}
            {supplier.drug_license_number && (
              <div className="text-gray-500">
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
        if (!supplier) return <div className="text-gray-400">N/A</div>;
        return (
          <div>
            {getPaymentTermsBadge(supplier)}
            <div className="mt-1 text-sm text-gray-500">Payable balance unavailable</div>
          </div>
        );
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
        <span className="text-sm text-gray-500" title="A canonical supplier edit command is not available">
          Read only
        </span>
      ),
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
    handleSaved,
    searchInputRef
  } = useEntityMaster<Supplier>({
    entityName: 'supplier',
    idField: 'supplier_id',
    nameField: 'supplier_name',
    api: {
      getAll: loadCanonicalSuppliers,
      update: suppliersApi.update
    },
    searchFields: ['supplier_name', 'supplier_code', 'primary_phone', 'gst_number'],
    filterField: 'supplier_type',
    softDelete: true
  });

  const columns = getColumns();

  // Summary stats
  const total = suppliers.length;
  const active = suppliers.filter(s => s.is_active !== false).length;
  const inactive = total - active;

  const headerActions = (
    <Button variant="primary" onClick={() => setShowAddModal(true)}>
      <Plus className="w-4 h-4 mr-2" />Add Supplier
    </Button>
  );

  return (
    <GlobalLayout
      title="Supplier Master"
      subtitle="Manage your supplier network"
      icon={Truck}
      headerActions={headerActions}
    >
      {/* Summary Stats Bar with Search & Filter */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-5 text-sm">
          <span className="text-gray-600">Total: <strong className="text-gray-900">{total}</strong></span>
          <span className="text-green-600">Active: <strong>{active}</strong></span>
          <span className="text-red-600">Inactive: <strong>{inactive}</strong></span>
          <span className="text-gray-600">Payable: <strong className="text-gray-900">Unavailable</strong></span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              ref={searchInputRef}
              type="text"
              aria-label="Search suppliers"
              placeholder="Search suppliers... ( / )"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="min-h-11 pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-56"
            />
          </div>
          <select
            aria-label="Filter suppliers by type"
            value={filterValue}
            onChange={(e) => setFilterValue(e.target.value)}
            className="min-h-11 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SUPPLIER_TYPES.map(type => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <span className="text-sm text-red-800">{error}</span>
        </div>
      )}

      <CanonicalWriteNotice
        action="Editing suppliers or changing supplier status"
        description="New supplier accounts use the canonical API. Existing supplier edits and status changes remain unavailable until their reviewed cloud commands exist."
      />

      {/* Supplier List */}
      <ContentCard title="Supplier List" subtitle={undefined} actions={undefined} className="overflow-hidden" icon={Truck}>
        {suppliers.length === 0 && !isLoading ? (
          <div className="text-center py-12">
            <Truck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
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
            emptyIcon={<Truck className="w-12 h-12 text-gray-400" />}
            selectable={false}
            hoverable={true}
            striped={true}
            paginated={true}
            pageSize={20}
            searchable={false}
          />
        )}
      </ContentCard>

      {/* Canonical online create flow; unsupported edits are not rendered. */}
      {showAddModal && (
        <SupplierFlow
          open={true}
          onSupplierCreated={handleSaved}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </GlobalLayout>
  );
};

export default SupplierMaster;
