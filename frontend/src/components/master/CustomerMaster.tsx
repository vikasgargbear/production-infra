import React, { useState, useEffect } from 'react';
import { 
  Users, Search, Plus, Edit2, Trash2, 
  Download, Upload, AlertCircle, Check, Loader2,
  Phone, Mail, MapPin, CreditCard, Shield,
  Building, Calendar, TrendingUp, Award, User
} from 'lucide-react';
import { customersApi } from '../../services/api';
import { DataTable, Column } from '../global/ui/display/DataTable';
import { GlobalLayout, ContentCard } from '../global';
import Button from '../global/ui/Button';
import Input from '../global/ui/forms/Input';
import { useToast } from '../global/ui/feedback/Toast';
import CustomerEditModal from './CustomerEditModal';

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

interface CustomerMasterProps {
  // Make it a full page component
}

const CustomerMaster: React.FC<CustomerMasterProps> = () => {
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Customer types - should come from backend or metadata API
  const [customerTypes, setCustomerTypes] = useState([
    { value: 'all', label: 'All Types' },
    { value: 'retail', label: 'Retail' },
    { value: 'wholesale', label: 'Wholesale' },
    { value: 'hospital', label: 'Hospital' },
    { value: 'clinic', label: 'Clinic' },
    { value: 'pharmacy', label: 'Pharmacy' }
  ]);

  // Load customers on component mount
  useEffect(() => {
    loadCustomers();
  }, []);

  // Load customers from API
  const loadCustomers = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await customersApi.getAll();
      console.log('Customers API Response:', response);
      
      // Handle different response formats
      const customerData = response.data?.customers || response.data?.data || response.data || [];
      setCustomers(Array.isArray(customerData) ? customerData : []);
    } catch (err) {
      console.error('Error loading customers:', err);
      setError('Failed to load customers. Please try again.');
      // Set empty array on error to prevent crashes
      setCustomers([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter customers based on search and type
  const filteredCustomers = customers.filter((customer: Customer) => {
    if (!customer) return false;
    
    const matchesSearch = searchTerm === '' || 
      customer.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.customer_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.primary_phone?.includes(searchTerm) ||
      customer.gst_number?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesType = filterType === 'all' || 
      customer.customer_type === filterType;
    
    return matchesSearch && matchesType;
  });

  const handleEditCustomer = (customer: Customer): void => {
    setEditingCustomer(customer);
  };

  const handleDeleteCustomer = async (customerId: string | number): Promise<void> => {
    // Find the customer to check current status
    const customer = customers.find(c => c.customer_id === Number(customerId));
    const isCurrentlyActive = customer?.is_active !== false;
    
    const action = isCurrentlyActive ? 'deactivate' : 'reactivate';
    const confirmMessage = isCurrentlyActive 
      ? 'Are you sure you want to deactivate this customer? The customer will be marked as inactive but all data will be preserved.'
      : 'Are you sure you want to reactivate this customer?';
    
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      // Toggle active status (soft delete/restore)
      // Need to send all required fields, not just is_active
      const updateData = {
        ...customer,
        is_active: !isCurrentlyActive,
        // Ensure customer_type is lowercase
        customer_type: customer?.customer_type?.toLowerCase() || 'retail'
      };
      await customersApi.update(customerId, updateData);
      toast.success(`Customer ${action}d successfully`);
      loadCustomers();
    } catch (err) {
      console.error(`Error ${action}ing customer:`, err);
      toast.error(`Failed to ${action} customer.`);
    }
  };

  const handleCustomerSaved = (): void => {
    setEditingCustomer(null);
    setShowAddModal(false);
    loadCustomers();
    toast.created('Customer');
  };

  const handleBulkDelete = async (): Promise<void> => {
    if (selectedCustomers.length === 0) return;
    
    if (!window.confirm(`Are you sure you want to deactivate ${selectedCustomers.length} customers? They will be marked as inactive but data will be preserved.`)) {
      return;
    }

    try {
      // Bulk soft delete - mark all as inactive
      await Promise.all(selectedCustomers.map(id => 
        customersApi.update(id, { is_active: false })
      ));
      toast.success(`${selectedCustomers.length} customers deactivated successfully`);
      setSelectedCustomers([]);
      loadCustomers();
    } catch (err) {
      console.error('Error bulk deactivating customers:', err);
      toast.error('Failed to deactivate some customers.');
    }
  };

  // Get credit status badge
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

  // Get loyalty tier badge
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

  // Define columns for DataTable
  const columns: Column<Customer>[] = [
    {
      key: 'customer_name',
      header: 'Customer',
      render: (_, customer) => {
        if (!customer) return <div>N/A</div>;
        return (
          <div>
            <div className="font-medium text-app-800">{customer.customer_name || 'N/A'}</div>
            <div className="text-sm text-app-500">{customer.customer_code || `ID: ${customer.customer_id}`}</div>
          </div>
        );
      },
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (_, customer) => {
        if (!customer) return <div>N/A</div>;
        return (
          <div>
            <div className="flex items-center text-app-800">
              <Phone className="w-3 h-3 mr-1" />
              {customer.primary_phone || 'N/A'}
            </div>
            {customer.primary_email && (
              <div className="text-sm text-app-500 truncate">{customer.primary_email}</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'customer_type',
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
      render: (_, customer) => {
        if (!customer) return <div>N/A</div>;
        // Check both gst_number and gstin fields as backend may use either
        const gstNumber = customer.gst_number || (customer as any).gstin;
        return (
          <div className="text-sm">
            {gstNumber ? (
              <div className="text-app-800">{gstNumber}</div>
            ) : (
              <div className="text-app-400">No GST</div>
            )}
            {customer.drug_license_number && (
              <div className="text-app-500">DL: {customer.drug_license_number}</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right' as const,
      render: (_, customer) => {
        if (!customer) return <div className="text-app-400">No Credit</div>;
        // Check multiple possible field names for credit limit
        const creditLimit = customer.credit_limit || (customer as any).creditLimit || 0;
        const creditDays = customer.credit_days || (customer as any).creditDays || 0;
        
        if (!creditLimit) return <div className="text-app-400">No Credit</div>;
        
        return (
          <div>
            <div className="font-medium">₹{creditLimit.toLocaleString()}</div>
            <div className="text-sm text-app-500">{creditDays} days</div>
            {getCreditStatus({...customer, credit_limit: creditLimit})}
          </div>
        );
      },
    },
    {
      key: 'loyalty_tier',
      header: 'Loyalty',
      align: 'center' as const,
      render: (value) => getLoyaltyBadge(value),
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
      render: (_, customer) => (
        <div className="flex items-center justify-center space-x-2">
          <button
            onClick={() => handleEditCustomer(customer)}
            className="text-primary-600 hover:text-primary-700 p-1 rounded transition-colors"
            disabled={!customer}
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDeleteCustomer(customer?.customer_id)}
            className={`${
              customer?.is_active !== false 
                ? 'text-warning-600 hover:text-warning-700' 
                : 'text-success-600 hover:text-success-700'
            } p-1 rounded transition-colors`}
            disabled={!customer?.customer_id}
            title={customer?.is_active !== false ? 'Deactivate Customer' : 'Reactivate Customer'}
          >
            {customer?.is_active !== false ? (
              <Trash2 className="w-4 h-4" />
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
        Add Customer
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
        subtitle={null} 
        actions={
          selectedCustomers.length > 0 ? (
            <Button
              variant="danger"
              size="sm"
              onClick={handleBulkDelete}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Deactivate ({selectedCustomers.length})
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
              placeholder="Search customers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12"
            />
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {customerTypes.map(type => (
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

      {/* Customer List */}
      <ContentCard title="Customer List" subtitle={null} actions={null} className="overflow-hidden" icon={Users}>
        {customers.length === 0 && !isLoading ? (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-app-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No customers found</h3>
            <p className="text-sm text-gray-500 mb-4">Get started by adding your first customer</p>
            <Button
              variant="primary"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Customer
            </Button>
          </div>
        ) : (
          <DataTable
            data={filteredCustomers}
            columns={columns}
            keyField="customer_id"
            loading={isLoading}
            emptyMessage="No customers found"
            emptyIcon={<Users className="w-12 h-12 text-app-400" />}
            selectable={true}
            selectedRows={filteredCustomers.filter(c => selectedCustomers.includes(String(c.customer_id)))}
            onSelectionChange={(selected) => setSelectedCustomers(selected.map(c => String(c.customer_id)))}
            hoverable={true}
            striped={true}
            paginated={true}
            pageSize={20}
            searchable={false}
          />
        )}
      </ContentCard>

      {/* Customer Edit/Add Modal */}
      {(showAddModal || editingCustomer) && (
        <CustomerEditModal
          isOpen={true}
          onClose={() => {
            setShowAddModal(false);
            setEditingCustomer(null);
          }}
          onSave={handleCustomerSaved}
          customer={editingCustomer}
        />
      )}
    </GlobalLayout>
  );
};

export default CustomerMaster;