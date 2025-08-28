import React, { useState, useEffect } from 'react';
import { 
  Truck, Search, Plus, Edit2, Trash2, 
  Download, Upload, AlertCircle, Check, Loader2,
  Phone, Mail, Building, CreditCard, Shield,
  AlertTriangle
} from 'lucide-react';
import { suppliersApi } from '../../services/api';
import { DataTable, Column } from '../global/ui/display/DataTable';
import { GlobalLayout, ContentCard } from '../global';
import Button from '../global/ui/Button';
import Input from '../global/ui/forms/Input';
import { useToast } from '../global/ui/feedback/Toast';
import SupplierEditModal from './SupplierEditModal';

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

interface SupplierMasterProps {
  // Make it a full page component
}

const SupplierMaster: React.FC<SupplierMasterProps> = () => {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Supplier types - should come from backend or metadata API
  const [supplierTypes, setSupplierTypes] = useState([
    { value: 'all', label: 'All Types' },
    { value: 'manufacturer', label: 'Manufacturer' },
    { value: 'distributor', label: 'Distributor' },
    { value: 'wholesaler', label: 'Wholesaler' },
    { value: 'stockist', label: 'Stockist' },
    { value: 'cnf', label: 'C&F Agent' }
  ]);

  // Load suppliers on component mount
  useEffect(() => {
    loadSuppliers();
  }, []);

  // Load suppliers from API
  const loadSuppliers = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      // Ensure trailing slash for backend compatibility
      const response = await suppliersApi.getAll();
      console.log('Suppliers API Response:', response);
      
      // Handle different response formats
      const supplierData = response.data?.suppliers || response.data?.data || response.data || [];
      setSuppliers(Array.isArray(supplierData) ? supplierData : []);
    } catch (err) {
      console.error('Error loading suppliers:', err);
      setError('Failed to load suppliers. Please try again.');
      // Set empty array on error to prevent crashes
      setSuppliers([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter suppliers based on search and type
  const filteredSuppliers = suppliers.filter((supplier: Supplier) => {
    if (!supplier) return false;
    
    const matchesSearch = searchTerm === '' || 
      supplier.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.supplier_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.primary_phone?.includes(searchTerm) ||
      supplier.gst_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.gstin?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || 
      supplier.supplier_type === filterType;
    
    return matchesSearch && matchesType;
  });

  const handleEditSupplier = (supplier: Supplier): void => {
    setEditingSupplier(supplier);
  };

  const handleDeleteSupplier = async (supplierId: string | number): Promise<void> => {
    // Find the supplier to check current status
    const supplier = suppliers.find(s => s.supplier_id === Number(supplierId));
    const isCurrentlyActive = supplier?.is_active !== false;
    
    const action = isCurrentlyActive ? 'deactivate' : 'reactivate';
    const confirmMessage = isCurrentlyActive 
      ? 'Are you sure you want to deactivate this supplier? The supplier will be marked as inactive but all data, purchase history, and payment records will be preserved.'
      : 'Are you sure you want to reactivate this supplier?';
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // Toggle active status (soft delete/restore)
      // Need to send all required fields, not just is_active
      const updateData = {
        ...supplier,
        is_active: !isCurrentlyActive,
        // Ensure supplier_type is lowercase if needed
        supplier_type: supplier?.supplier_type?.toLowerCase() || 'distributor'
      };
      await suppliersApi.update(supplierId, updateData);
      toast.success(`Supplier ${action}d successfully`);
      loadSuppliers();
    } catch (err) {
      console.error(`Error ${action}ing supplier:`, err);
      toast.error(`Failed to ${action} supplier.`);
    }
  };

  const handleSupplierSaved = (): void => {
    setEditingSupplier(null);
    setShowAddModal(false);
    loadSuppliers();
    toast.created('Supplier');
  };

  const handleBulkDelete = async (): Promise<void> => {
    if (selectedSuppliers.length === 0) return;
    
    if (!window.confirm(`Are you sure you want to deactivate ${selectedSuppliers.length} suppliers? They will be marked as inactive but all data will be preserved.`)) {
      return;
    }

    try {
      // Bulk soft delete - mark all as inactive
      await Promise.all(selectedSuppliers.map(id => 
        suppliersApi.update(id, { is_active: false })
      ));
      toast.success(`${selectedSuppliers.length} suppliers deactivated successfully`);
      setSelectedSuppliers([]);
      loadSuppliers();
    } catch (err) {
      console.error('Error bulk deactivating suppliers:', err);
      toast.error('Failed to deactivate some suppliers.');
    }
  };

  // Get payment terms badge
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

  // Get license status
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

  // Define columns for DataTable
  const columns: Column<Supplier>[] = [
    {
      key: 'supplier_name',
      header: 'Supplier',
      render: (_, supplier) => {
        if (!supplier) return <div>N/A</div>;
        return (
          <div>
            <div className="font-medium text-app-800">{supplier.supplier_name || 'N/A'}</div>
            <div className="text-sm text-app-500">{supplier.supplier_code || `ID: ${supplier.supplier_id}`}</div>
          </div>
        );
      },
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (_, supplier) => {
        if (!supplier) return <div>N/A</div>;
        return (
          <div>
            <div className="flex items-center text-app-800">
              <Phone className="w-3 h-3 mr-1" />
              {supplier.primary_phone || 'N/A'}
            </div>
            {supplier.primary_email && (
              <div className="text-sm text-app-500 truncate">{supplier.primary_email}</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'supplier_type',
      header: 'Type',
      render: (value) => (
        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-primary-100 text-primary-800">
          {value || 'N/A'}
        </span>
      ),
    },
    {
      key: 'gst_number',
      header: 'GST/License',
      render: (_, supplier) => {
        if (!supplier) return <div>N/A</div>;
        // Check both gst_number and gstin fields as backend may use either
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
      },
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
      },
    },
    {
      key: 'is_active',
      header: 'Status',
      align: 'center' as const,
      render: (value) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
          value !== false ? 'bg-success-100 text-success-800' : 'bg-danger-100 text-danger-800'
        }`}>
          {value !== false ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center' as const,
      sortable: false,
      render: (_, supplier) => (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => handleEditSupplier(supplier)}
            className="text-primary-600 hover:text-primary-700 p-1 rounded transition-colors"
            disabled={!supplier}
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDeleteSupplier(supplier?.supplier_id)}
            className={`${
              supplier?.is_active !== false 
                ? 'text-warning-600 hover:text-warning-700' 
                : 'text-success-600 hover:text-success-700'
            } p-1 rounded transition-colors`}
            disabled={!supplier?.supplier_id}
            title={supplier?.is_active !== false ? 'Deactivate Supplier' : 'Reactivate Supplier'}
          >
            {supplier?.is_active !== false ? (
              supplier?.current_outstanding && supplier.current_outstanding > 0 ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )
            ) : (
              <Check className="w-4 h-4" />
            )}
          </button>
        </div>
      ),
    },
  ];

  const headerActions = (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {/* Import logic */}}
      >
        <Upload className="w-4 h-4 mr-2" />
        Import
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {/* Export logic */}}
      >
        <Download className="w-4 h-4 mr-2" />
        Export
      </Button>
      <Button
        variant="primary"
        onClick={() => setShowAddModal(true)}
      >
        <Plus className="w-4 h-4 mr-2" />
        Add Supplier
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
        actions={
          selectedSuppliers.length > 0 ? (
            <Button
              variant="danger"
              size="sm"
              onClick={handleBulkDelete}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Deactivate ({selectedSuppliers.length})
            </Button>
          ) : null
        } 
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
          <div className="flex items-center space-x-4">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {supplierTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
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
            <Button
              variant="primary"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Supplier
            </Button>
          </div>
        ) : (
          <DataTable
            data={filteredSuppliers}
            columns={columns}
            keyField="supplier_id"
            loading={isLoading}
            emptyMessage="No suppliers found"
            emptyIcon={<Truck className="w-12 h-12 text-app-400" />}
            selectable={true}
            selectedRows={filteredSuppliers.filter(s => selectedSuppliers.includes(String(s.supplier_id)))}
            onSelectionChange={(selected) => setSelectedSuppliers(selected.map(s => String(s.supplier_id)))}
            hoverable={true}
            striped={true}
            paginated={true}
            pageSize={20}
            searchable={false}
          />
        )}
      </ContentCard>

      {/* Supplier Edit/Add Modal */}
      {(showAddModal || editingSupplier) && (
        <SupplierEditModal
          isOpen={true}
          onClose={() => {
            setShowAddModal(false);
            setEditingSupplier(null);
          }}
          onSave={handleSupplierSaved}
          supplier={editingSupplier}
        />
      )}
    </GlobalLayout>
  );
};

export default SupplierMaster;