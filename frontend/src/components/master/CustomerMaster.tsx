import React, { useState, useEffect } from 'react';
import { 
  Users, Search, Plus, Edit2, Filter, Download, Upload,
  Phone, Mail, MapPin, AlertTriangle, CheckCircle, 
  Star, CreditCard, Calendar, TrendingUp, Building,
  Shield, Clock, User, X, ChevronRight, FileText,
  AlertCircle, MessageCircle
} from 'lucide-react';
import { Card, Button, Badge, DataTable, Modal } from '../global';
import { theme, classes } from '../../config/theme.config';
import { customersApi } from '../../services/api';
import CustomerCreationModal from '../global/modals/CustomerCreationModal';

interface Customer {
  customer_id: number;
  customer_name: string;
  customer_type: string;
  primary_phone: string;
  primary_email?: string;
  whatsapp_number?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gst_number?: string;
  drug_license_number?: string;
  drug_license_validity?: string;
  credit_limit?: number;
  credit_days?: number;
  credit_rating?: string;
  current_outstanding?: number;
  assigned_salesperson_id?: number;
  territory_id?: number;
  customer_category?: string;
  loyalty_tier?: string;
  is_active?: boolean;
  last_transaction_date?: string;
  total_business_amount?: number;
}

const CustomerMaster: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const response = await customersApi.getAll();
      const customerData = response.data?.data || response.data || [];
      setCustomers(customerData);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = 
      customer.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.primary_phone?.includes(searchTerm) ||
      customer.gst_number?.includes(searchTerm);
    
    const matchesStatus = 
      filterStatus === 'all' || 
      (filterStatus === 'active' && customer.is_active !== false) ||
      (filterStatus === 'inactive' && customer.is_active === false);
    
    return matchesSearch && matchesStatus;
  });

  const getLicenseStatus = (expiryDate?: string) => {
    if (!expiryDate) return { status: 'missing', color: 'gray', text: 'No License' };
    
    const today = new Date();
    const expiry = new Date(expiryDate);
    const daysToExpiry = Math.floor((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysToExpiry < 0) return { status: 'expired', color: 'red', text: 'Expired' };
    if (daysToExpiry <= 30) return { status: 'expiring', color: 'amber', text: `${daysToExpiry}d left` };
    return { status: 'valid', color: 'green', text: 'Valid' };
  };

  const getCreditRatingBadge = (rating?: string) => {
    const colors = {
      'A': 'bg-green-100 text-green-800 border-green-200',
      'B': 'bg-blue-100 text-blue-800 border-blue-200',
      'C': 'bg-amber-100 text-amber-800 border-amber-200',
      'D': 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[rating as keyof typeof colors] || 'bg-gray-100 text-gray-600 border-gray-200';
  };

  // Statistics Cards - Only essential metrics
  const stats = {
    total: customers.length,
    active: customers.filter(c => c.is_active !== false).length,
    withLicense: customers.filter(c => c.drug_license_number).length,
    totalOutstanding: customers.reduce((sum, c) => sum + (c.current_outstanding || 0), 0)
  };

  return (
    <div className="h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Customer Master</h1>
              <p className="text-sm text-gray-500">Manage your customer database</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
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
              onClick={() => setShowCreateModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
          </div>
        </div>
      </div>

      {/* Statistics Cards - Simplified */}
      <div className="px-6 py-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-xl font-semibold text-gray-900">{stats.total}</p>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">Active</p>
            <p className="text-xl font-semibold text-green-600">{stats.active}</p>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">Licensed</p>
            <p className="text-xl font-semibold text-blue-600">{stats.withLicense}</p>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500">Outstanding</p>
            <p className="text-xl font-semibold text-orange-600">
              ₹{(stats.totalOutstanding / 100000).toFixed(1)}L
            </p>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="px-6 pb-4">
        <Card className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, phone, GST number..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            {/* Status Filter */}
            <div className="flex gap-2">
              {['all', 'active', 'inactive'].map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filterStatus === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* Customer List */}
      <div className="px-6 pb-6">
        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center text-gray-600">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mr-3"></div>
                Loading customers...
              </div>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No customers found</p>
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add First Customer
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      License Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Credit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Outstanding
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredCustomers.map((customer) => {
                    const licenseStatus = getLicenseStatus(customer.drug_license_validity);
                    
                    return (
                      <tr key={customer.customer_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {customer.customer_name}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {customer.city || customer.state || 'Location not specified'}
                            </p>
                            {customer.gst_number && (
                              <p className="text-xs text-gray-500">GST: {customer.gst_number}</p>
                            )}
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center text-sm text-gray-600">
                              <Phone className="w-3 h-3 mr-1" />
                              {customer.primary_phone}
                            </div>
                            {customer.whatsapp_number && (
                              <div className="flex items-center text-sm text-green-600">
                                <MessageCircle className="w-3 h-3 mr-1" />
                                {customer.whatsapp_number}
                              </div>
                            )}
                            {customer.primary_email && (
                              <div className="flex items-center text-sm text-gray-600">
                                <Mail className="w-3 h-3 mr-1" />
                                {customer.primary_email}
                              </div>
                            )}
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          {customer.drug_license_number ? (
                            <div>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                ${licenseStatus.status === 'expired' ? 'bg-red-100 text-red-800 border border-red-200' :
                                  licenseStatus.status === 'expiring' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                  'bg-green-100 text-green-800 border border-green-200'}`}>
                                {licenseStatus.status === 'expired' && <X className="w-3 h-3 mr-1" />}
                                {licenseStatus.status === 'expiring' && <AlertTriangle className="w-3 h-3 mr-1" />}
                                {licenseStatus.status === 'valid' && <CheckCircle className="w-3 h-3 mr-1" />}
                                {licenseStatus.text}
                              </span>
                              <p className="text-xs text-gray-500 mt-1">
                                {customer.drug_license_number}
                              </p>
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              No License
                            </span>
                          )}
                        </td>
                        
                        <td className="px-6 py-4">
                          <div>
                            {customer.credit_rating && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getCreditRatingBadge(customer.credit_rating)}`}>
                                Rating {customer.credit_rating}
                              </span>
                            )}
                            <p className="text-sm text-gray-600 mt-1">
                              ₹{((customer.credit_limit || 0) / 1000).toFixed(0)}k
                              {customer.credit_days && ` • ${customer.credit_days}d`}
                            </p>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div>
                            <p className={`text-sm font-medium ${
                              (customer.current_outstanding || 0) > (customer.credit_limit || 0) 
                                ? 'text-red-600' 
                                : 'text-gray-900'
                            }`}>
                              ₹{((customer.current_outstanding || 0) / 1000).toFixed(1)}k
                            </p>
                            {customer.last_transaction_date && (
                              <p className="text-xs text-gray-500 mt-1">
                                Last: {new Date(customer.last_transaction_date).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            customer.is_active !== false
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {customer.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedCustomer(customer);
                                setShowDetails(true);
                              }}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                              title="View Details"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedCustomer(customer);
                                setShowCreateModal(true);
                              }}
                              className="text-gray-400 hover:text-blue-600 transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <CustomerCreationModal
          show={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedCustomer(null);
          }}
          onCustomerCreated={(customer) => {
            loadCustomers();
            setShowCreateModal(false);
            setSelectedCustomer(null);
          }}
          existingCustomer={selectedCustomer}
        />
      )}

      {/* Customer Details Modal */}
      {showDetails && selectedCustomer && (
        <Modal
          isOpen={showDetails}
          onClose={() => setShowDetails(false)}
          title="Customer Details"
          size="lg"
        >
          <div className="p-6">
            {/* Customer details content */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{selectedCustomer.customer_name}</h3>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${getCreditRatingBadge(selectedCustomer.credit_rating || 'C')}`}>
                  Credit Rating {selectedCustomer.credit_rating || 'C'}
                </span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Contact</p>
                  <p className="text-sm font-medium">{selectedCustomer.primary_phone}</p>
                  {selectedCustomer.whatsapp_number && (
                    <p className="text-sm text-green-600">WhatsApp: {selectedCustomer.whatsapp_number}</p>
                  )}
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Outstanding</p>
                  <p className="text-sm font-medium">₹{(selectedCustomer.current_outstanding || 0).toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Limit: ₹{(selectedCustomer.credit_limit || 0).toLocaleString()}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Drug License</p>
                  <p className="text-sm font-medium">{selectedCustomer.drug_license_number || 'Not provided'}</p>
                  {selectedCustomer.drug_license_validity && (
                    <p className="text-xs text-gray-500">Valid till: {new Date(selectedCustomer.drug_license_validity).toLocaleDateString()}</p>
                  )}
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">GST Number</p>
                  <p className="text-sm font-medium">{selectedCustomer.gst_number || 'Not provided'}</p>
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <p className="text-sm text-gray-500">Address</p>
                <p className="text-sm">{selectedCustomer.address}</p>
                <p className="text-sm">{selectedCustomer.city}, {selectedCustomer.state} - {selectedCustomer.pincode}</p>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default CustomerMaster;