import React, { useState, useEffect, useCallback } from 'react';
import { 
  Users, Plus, Search, Edit2, Trash2, Phone, Mail, MapPin, 
  CreditCard, Building, FileText, Download, Upload, Filter,
  ChevronLeft, ChevronRight, MoreVertical, CheckCircle, AlertCircle
} from 'lucide-react';
import { customersApi } from '../../services/api';
import { ModuleHeader, DataTable, StatusBadge, SearchBar, CustomerCreationModal } from '../global';
import { exportToExcel } from '../../utils/exportHelpers';

const CustomerManagementV2 = () => {
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(15);
  const [sortBy, setSortBy] = useState('customer_name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [filterType, setFilterType] = useState('all');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Summary stats
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    totalCredit: 0,
    totalOutstanding: 0
  });

  // Fetch customers
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await customersApi.getAll();
      const customerData = response.data || [];
      setCustomers(customerData);
      setFilteredCustomers(customerData);
      calculateStats(customerData);
    } catch (error) {
      console.error('Error fetching customers:', error);
      setMessage('Failed to load customers');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Calculate statistics
  const calculateStats = (customerData) => {
    const stats = customerData.reduce((acc, customer) => {
      acc.total++;
      if (customer.status === 'active') acc.active++;
      else acc.inactive++;
      acc.totalCredit += parseFloat(customer.credit_limit) || 0;
      acc.totalOutstanding += parseFloat(customer.outstanding_amount) || 0;
      return acc;
    }, { total: 0, active: 0, inactive: 0, totalCredit: 0, totalOutstanding: 0 });
    
    setStats(stats);
  };

  // Search and filter
  useEffect(() => {
    let filtered = [...customers];

    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(customer => 
        customer.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.phone?.includes(searchQuery) ||
        customer.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.gst_number?.includes(searchQuery)
      );
    }

    // Apply filter
    if (filterType !== 'all') {
      filtered = filtered.filter(customer => customer.customer_type === filterType);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal = a[sortBy] || '';
      let bVal = b[sortBy] || '';
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    setFilteredCustomers(filtered);
    setCurrentPage(1);
  }, [searchQuery, filterType, sortBy, sortOrder, customers]);

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentCustomers = filteredCustomers.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);

  // Handle actions
  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setShowCreateModal(true);
  };

  const handleDelete = async (customerId) => {
    if (window.confirm('Are you sure you want to delete this customer?')) {
      try {
        await customersApi.delete(customerId);
        setMessage('Customer deleted successfully');
        setMessageType('success');
        fetchCustomers();
      } catch (error) {
        console.error('Error deleting customer:', error);
        setMessage('Failed to delete customer');
        setMessageType('error');
      }
    }
  };

  const handleExport = () => {
    const exportData = filteredCustomers.map(customer => ({
      'Customer Name': customer.customer_name,
      'Type': customer.customer_type,
      'Phone': customer.phone,
      'Email': customer.email,
      'City': customer.city,
      'State': customer.state,
      'GST Number': customer.gst_number,
      'Credit Limit': customer.credit_limit,
      'Outstanding': customer.outstanding_amount,
      'Status': customer.status
    }));
    
    exportToExcel(exportData, 'customers');
  };

  const handleBulkAction = (action) => {
    if (selectedCustomers.length === 0) {
      setMessage('Please select customers first');
      setMessageType('error');
      return;
    }

    switch (action) {
      case 'delete':
        if (window.confirm(`Delete ${selectedCustomers.length} customers?`)) {
          // Implement bulk delete
          console.log('Bulk delete:', selectedCustomers);
        }
        break;
      case 'export':
        const selectedData = customers.filter(c => selectedCustomers.includes(c.customer_id));
        exportToExcel(selectedData, 'selected_customers');
        break;
      default:
        break;
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <ModuleHeader
        title="Customer Management"
        icon={Users}
        iconColor="text-indigo-600"
        actions={[
          {
            label: "Add Customer",
            onClick: () => setShowCreateModal(true),
            icon: Plus,
            variant: "primary"
          },
          {
            label: "Export",
            onClick: handleExport,
            icon: Download,
            variant: "default"
          }
        ]}
      />

      {/* Stats Cards */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Customers</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <Users className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Inactive</p>
                <p className="text-2xl font-bold text-gray-500">{stats.inactive}</p>
              </div>
              <AlertCircle className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Credit</p>
                <p className="text-2xl font-bold text-blue-600">₹{stats.totalCredit.toFixed(0)}</p>
              </div>
              <CreditCard className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Outstanding</p>
                <p className="text-2xl font-bold text-orange-600">₹{stats.totalOutstanding.toFixed(0)}</p>
              </div>
              <FileText className="w-8 h-8 text-orange-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="px-6 pb-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, phone, email, or GST..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Type Filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">All Types</option>
                <option value="retail">Retail</option>
                <option value="wholesale">Wholesale</option>
                <option value="distributor">Distributor</option>
                <option value="hospital">Hospital</option>
              </select>

              {/* Sort */}
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('-');
                  setSortBy(field);
                  setSortOrder(order);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="customer_name-asc">Name (A-Z)</option>
                <option value="customer_name-desc">Name (Z-A)</option>
                <option value="created_at-desc">Newest First</option>
                <option value="created_at-asc">Oldest First</option>
                <option value="outstanding_amount-desc">Highest Outstanding</option>
                <option value="credit_limit-desc">Highest Credit</option>
              </select>
            </div>

            {/* Bulk Actions */}
            {selectedCustomers.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{selectedCustomers.length} selected</span>
                <button
                  onClick={() => handleBulkAction('export')}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  Export Selected
                </button>
                <button
                  onClick={() => handleBulkAction('delete')}
                  className="px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 text-red-600 rounded-lg"
                >
                  Delete Selected
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message Display */}
      {message && (
        <div className="px-6 pb-4">
          <div className={`p-3 rounded-lg flex items-center ${
            messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {messageType === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertCircle className="w-4 h-4 mr-2" />}
            {message}
          </div>
        </div>
      )}

      {/* Customer List */}
      <div className="flex-1 overflow-hidden px-6">
        <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading customers...</p>
              </div>
            </div>
          ) : currentCustomers.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No customers found</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Add First Customer
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="flex-1 overflow-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCustomers(currentCustomers.map(c => c.customer_id));
                            } else {
                              setSelectedCustomers([]);
                            }
                          }}
                          checked={selectedCustomers.length === currentCustomers.length && currentCustomers.length > 0}
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit Limit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Outstanding</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {currentCustomers.map((customer) => (
                      <tr key={customer.customer_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedCustomers.includes(customer.customer_id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCustomers([...selectedCustomers, customer.customer_id]);
                              } else {
                                setSelectedCustomers(selectedCustomers.filter(id => id !== customer.customer_id));
                              }
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{customer.customer_name}</div>
                            {customer.gst_number && (
                              <div className="text-xs text-gray-500">GST: {customer.gst_number}</div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm">
                            {customer.phone && (
                              <div className="flex items-center gap-1 text-gray-600">
                                <Phone className="w-3 h-3" />
                                {customer.phone}
                              </div>
                            )}
                            {customer.email && (
                              <div className="flex items-center gap-1 text-gray-600">
                                <Mail className="w-3 h-3" />
                                {customer.email}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-600">
                            <div className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {customer.city}, {customer.state}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                            {customer.customer_type || 'Retail'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-medium">₹{(customer.credit_limit || 0).toFixed(0)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-medium ${
                            customer.outstanding_amount > 0 ? 'text-orange-600' : 'text-gray-900'
                          }`}>
                            ₹{(customer.outstanding_amount || 0).toFixed(0)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge 
                            status={customer.status || 'active'} 
                            type="customer"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEdit(customer)}
                              className="p-1 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(customer.customer_id)}
                              className="p-1 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredCustomers.length)} of {filteredCustomers.length} customers
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = currentPage <= 3 ? i + 1 : currentPage + i - 2;
                      if (pageNum > totalPages) return null;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-1 rounded-lg ${
                            currentPage === pageNum
                              ? 'bg-indigo-600 text-white'
                              : 'border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Customer Creation/Edit Modal */}
      {showCreateModal && (
        <CustomerCreationModal
          show={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setEditingCustomer(null);
          }}
          onCustomerCreated={(customer) => {
            setShowCreateModal(false);
            setEditingCustomer(null);
            fetchCustomers();
            setMessage(editingCustomer ? 'Customer updated successfully' : 'Customer created successfully');
            setMessageType('success');
          }}
          editingCustomer={editingCustomer}
        />
      )}
    </div>
  );
};

export default CustomerManagementV2;