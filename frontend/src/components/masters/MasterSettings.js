import React, { useState, useEffect } from 'react';
import { 
  Package, Users, Building, Database, Shield, Settings,
  Plus, Search, Filter, Download, Upload, Edit, Trash2,
  Eye, ChevronRight, X, Loader2, FileText, UserCheck,
  Box, Calendar, Hash, Phone, Mail, MapPin, CreditCard
} from 'lucide-react';
import ProductMaster from './ProductMaster';
import CustomerMaster from './CustomerMaster';
import SupplierMaster from './SupplierMaster';
import BatchMaster from './BatchMaster';
import UserMaster from './UserMaster';
import OrganizationMaster from './OrganizationMaster';
import { 
  productsApi, customersApi, suppliersApi, 
  batchesApi, usersApi, organizationsApi 
} from '../../services/api';
import { useToast } from '../global';

const MasterSettings = () => {
  const toast = useToast();
  
  const [activeTab, setActiveTab] = useState('products');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItems, setSelectedItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0
  });
  
  // Modal states
  const [modalState, setModalState] = useState({
    isOpen: false,
    mode: 'create', // 'create' | 'edit' | 'view'
    item: null,
    type: null
  });

  const masterTabs = [
    { 
      id: 'products', 
      label: 'Products', 
      icon: Package,
      color: 'blue',
      description: 'Manage product catalog and inventory'
    },
    { 
      id: 'customers', 
      label: 'Customers', 
      icon: Users,
      color: 'green',
      description: 'Customer information and relationships'
    },
    { 
      id: 'suppliers', 
      label: 'Suppliers', 
      icon: Building,
      color: 'purple',
      description: 'Supplier and vendor management'
    },
    { 
      id: 'batches', 
      label: 'Batches', 
      icon: Box,
      color: 'orange',
      description: 'Batch tracking and expiry management'
    },
    { 
      id: 'users', 
      label: 'Users', 
      icon: UserCheck,
      color: 'indigo',
      description: 'User accounts and permissions'
    },
    { 
      id: 'organization', 
      label: 'Organization', 
      icon: Shield,
      color: 'red',
      description: 'Organization settings and configuration'
    }
  ];

  useEffect(() => {
    loadData();
  }, [activeTab, searchQuery, pagination.page]);

  const loadData = async () => {
    setLoading(true);
    try {
      let response;
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        search: searchQuery
      };

      switch (activeTab) {
        case 'products':
          response = await productsApi.getAll(params);
          break;
        case 'customers':
          response = await customersApi.getAll(params);
          break;
        case 'suppliers':
          response = await suppliersApi.getAll(params);
          break;
        case 'batches':
          response = await batchesApi.getAll(params);
          break;
        case 'users':
          response = await usersApi.getAll(params);
          break;
        case 'organization':
          response = await organizationsApi.get();
          break;
        default:
          response = { data: [] };
      }

      if (response.data) {
        if (activeTab === 'organization') {
          // Organization is a single entity
          setData(response.data ? [response.data] : []);
        } else {
          setData(response.data.items || response.data || []);
          if (response.data.pagination) {
            setPagination(response.data.pagination);
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setModalState({
      isOpen: true,
      mode: 'create',
      item: null,
      type: activeTab
    });
  };

  const handleEdit = (item) => {
    setModalState({
      isOpen: true,
      mode: 'edit',
      item: item,
      type: activeTab
    });
  };

  const handleView = (item) => {
    setModalState({
      isOpen: true,
      mode: 'view',
      item: item,
      type: activeTab
    });
  };

  const handleDelete = async (item) => {
    if (!window.confirm('Are you sure you want to delete this item?')) {
      return;
    }

    try {
      let idField;
      switch (activeTab) {
        case 'products':
          idField = 'product_id';
          await productsApi.delete(item[idField]);
          break;
        case 'customers':
          idField = 'customer_id';
          await customersApi.delete(item[idField]);
          break;
        case 'suppliers':
          idField = 'supplier_id';
          await suppliersApi.delete(item[idField]);
          break;
        case 'batches':
          idField = 'batch_id';
          await batchesApi.delete(item[idField]);
          break;
        case 'users':
          idField = 'user_id';
          await usersApi.delete(item[idField]);
          break;
      }
      
      toast.success('Item deleted successfully');
      loadData();
    } catch (error) {
      toast.error('Failed to delete item');
      console.error('Delete error:', error);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) {
      toast.warning('Please select items to delete');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${selectedItems.length} items?`)) {
      return;
    }

    try {
      // Implement bulk delete API calls
      for (const itemId of selectedItems) {
        // Call delete API based on activeTab
      }
      toast.success(`${selectedItems.length} items deleted successfully`);
      setSelectedItems([]);
      loadData();
    } catch (error) {
      toast.error('Failed to delete items');
    }
  };

  const handleExport = async () => {
    try {
      // Implement export functionality
      toast.info('Exporting data...');
      // Generate CSV/Excel file
    } catch (error) {
      toast.error('Failed to export data');
    }
  };

  const handleImport = () => {
    // Open file picker for import
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        // Implement import functionality
        toast.info('Importing data...');
      }
    };
    input.click();
  };

  const getItemDisplay = (item) => {
    switch (activeTab) {
      case 'products':
        return {
          title: item.product_name,
          subtitle: item.product_code,
          badge: item.category,
          stats: [
            { label: 'Stock', value: item.current_stock || 0 },
            { label: 'MRP', value: `₹${item.mrp || 0}` },
            { label: 'GST', value: `${item.gst_percentage || 0}%` }
          ]
        };
      case 'customers':
        return {
          title: item.customer_name,
          subtitle: item.customer_code || item.primary_phone,
          badge: item.customer_type,
          stats: [
            { label: 'Credit Limit', value: `₹${item.credit_limit || 0}` },
            { label: 'Outstanding', value: `₹${item.current_outstanding || 0}` },
            { label: 'Grade', value: item.customer_grade || 'N/A' }
          ]
        };
      case 'suppliers':
        return {
          title: item.supplier_name,
          subtitle: item.supplier_code || item.primary_phone,
          badge: item.supplier_type,
          stats: [
            { label: 'Payment Days', value: item.payment_days || 0 },
            { label: 'Rating', value: item.quality_rating || 'N/A' },
            { label: 'Status', value: item.is_active ? 'Active' : 'Inactive' }
          ]
        };
      case 'batches':
        return {
          title: item.batch_number,
          subtitle: item.product_name,
          badge: item.status,
          stats: [
            { label: 'Expiry', value: item.expiry_date || 'N/A' },
            { label: 'Stock', value: item.current_stock || 0 },
            { label: 'MRP', value: `₹${item.mrp || 0}` }
          ]
        };
      case 'users':
        return {
          title: item.full_name || item.username,
          subtitle: item.email,
          badge: item.role,
          stats: [
            { label: 'Department', value: item.department || 'N/A' },
            { label: 'Status', value: item.is_active ? 'Active' : 'Inactive' },
            { label: 'Last Login', value: item.last_login || 'Never' }
          ]
        };
      case 'organization':
        return {
          title: item.org_name,
          subtitle: item.org_code,
          badge: item.org_type,
          stats: [
            { label: 'Users', value: item.user_count || 0 },
            { label: 'Plan', value: item.subscription_plan || 'Basic' },
            { label: 'Status', value: item.is_active ? 'Active' : 'Inactive' }
          ]
        };
      default:
        return {
          title: 'Unknown',
          subtitle: '',
          badge: '',
          stats: []
        };
    }
  };

  const renderModal = () => {
    if (!modalState.isOpen) return null;

    const commonProps = {
      isOpen: modalState.isOpen,
      onClose: () => setModalState({ ...modalState, isOpen: false }),
      mode: modalState.mode,
      onSave: () => {
        setModalState({ ...modalState, isOpen: false });
        loadData();
      }
    };

    switch (modalState.type) {
      case 'products':
        return <ProductMaster {...commonProps} product={modalState.item} />;
      case 'customers':
        return <CustomerMaster {...commonProps} customer={modalState.item} />;
      case 'suppliers':
        return <SupplierMaster {...commonProps} supplier={modalState.item} />;
      case 'batches':
        return <BatchMaster {...commonProps} batch={modalState.item} />;
      case 'users':
        return <UserMaster {...commonProps} user={modalState.item} />;
      case 'organization':
        return <OrganizationMaster {...commonProps} organization={modalState.item} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Master Settings</h1>
              <p className="text-sm text-gray-500 mt-1">Manage all master data and configurations</p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleImport}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
              >
                <Upload className="w-4 h-4" />
                <span>Import</span>
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add New</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6">
          <div className="flex space-x-1 border-b border-gray-200">
            {masterTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setSelectedItems([]);
                    setPagination({ ...pagination, page: 1 });
                  }}
                  className={`px-4 py-3 flex items-center space-x-2 border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? `border-${tab.color}-500 text-${tab.color}-600`
                      : 'border-transparent text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4 flex-1">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${activeTab}...`}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <button className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center space-x-2">
              <Filter className="w-4 h-4" />
              <span>Filters</span>
            </button>
          </div>
          
          {selectedItems.length > 0 && (
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-600">
                {selectedItems.length} selected
              </span>
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1 text-red-600 bg-red-50 rounded hover:bg-red-100"
              >
                Delete Selected
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading data...</p>
            </div>
          </div>
        ) : data.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-900">No {activeTab} found</p>
              <p className="text-sm text-gray-500 mt-1">
                {searchQuery ? 'Try adjusting your search' : 'Create your first entry'}
              </p>
              <button
                onClick={handleCreate}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add {activeTab.slice(0, -1)}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {data.map((item, index) => {
                const display = getItemDisplay(item);
                const itemId = item.product_id || item.customer_id || item.supplier_id || 
                              item.batch_id || item.user_id || item.org_id || index;
                
                return (
                  <div
                    key={itemId}
                    className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 truncate">
                            {display.title}
                          </h3>
                          <p className="text-sm text-gray-500 truncate">
                            {display.subtitle}
                          </p>
                        </div>
                        {display.badge && (
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
                            {display.badge}
                          </span>
                        )}
                      </div>

                      {display.stats && display.stats.length > 0 && (
                        <div className="space-y-1 mb-3">
                          {display.stats.map((stat, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span className="text-gray-500">{stat.label}:</span>
                              <span className="font-medium text-gray-900">{stat.value}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center space-x-2 pt-3 border-t border-gray-100">
                        <button
                          onClick={() => handleView(item)}
                          className="flex-1 px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200 flex items-center justify-center"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1" />
                          View
                        </button>
                        <button
                          onClick={() => handleEdit(item)}
                          className="flex-1 px-3 py-1.5 text-sm text-blue-700 bg-blue-100 rounded hover:bg-blue-200 flex items-center justify-center"
                        >
                          <Edit className="w-3.5 h-3.5 mr-1" />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="px-3 py-1.5 text-sm text-red-700 bg-red-100 rounded hover:bg-red-200"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center space-x-2">
                <button
                  onClick={() => setPagination({ ...pagination, page: pagination.page - 1 })}
                  disabled={pagination.page === 1}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-600">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPagination({ ...pagination, page: pagination.page + 1 })}
                  disabled={pagination.page === pagination.totalPages}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Render the appropriate modal */}
      {renderModal()}
    </div>
  );
};

export default MasterSettings;