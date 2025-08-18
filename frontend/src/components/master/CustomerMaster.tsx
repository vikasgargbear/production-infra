import React, { useState, useEffect } from 'react';
import { 
  Users, Search, Plus, Edit2, Filter, Download, Upload,
  Phone, Mail, MapPin, AlertTriangle, CheckCircle, 
  Star, CreditCard, Calendar, TrendingUp, Building,
  Shield, Clock, User, X, ChevronRight, FileText,
  AlertCircle, MessageCircle
} from 'lucide-react';
import { Card, Button, Badge, DataTable, BaseModal, GlobalLayout, ContentCard, StatsGrid } from '../global';
import { theme, classes } from '../../config/theme.config';
import { customersApi } from '../../services/api';
import CustomerCreationModal from '../global/modals/CustomerCreationModal';
import { useToast } from '../global/ui/feedback/Toast';

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
  const toast = useToast();
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
      'A': 'bg-success-100 text-success-800 border-success-200',
      'B': 'bg-primary-100 text-primary-800 border-primary-200',
      'C': 'bg-warning-100 text-warning-800 border-warning-200',
      'D': 'bg-danger-100 text-danger-800 border-danger-200'
    };
    return colors[rating as keyof typeof colors] || 'bg-app-100 text-app-600 border-app-200';
  };

  // Statistics Cards - Only essential metrics
  const stats = {
    total: customers.length,
    active: customers.filter(c => c.is_active !== false).length,
    withLicense: customers.filter(c => c.drug_license_number).length,
    totalOutstanding: customers.reduce((sum, c) => sum + (c.current_outstanding || 0), 0)
  };

  // Prepare stats data for StatsGrid
  const statsData = [
    {
      label: 'Total Customers',
      value: stats.total,
      icon: Users,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600'
    },
    {
      label: 'Active',
      value: stats.active,
      icon: CheckCircle,
      iconBg: 'bg-green-100', 
      iconColor: 'text-green-600'
    },
    {
      label: 'Licensed',
      value: stats.withLicense,
      icon: Shield,
      iconBg: 'bg-purple-100',
      iconColor: 'text-purple-600'
    },
    {
      label: 'Outstanding',
      value: `₹${(stats.totalOutstanding / 100000).toFixed(1)}L`,
      icon: AlertTriangle,
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-600'
    }
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
        onClick={() => setShowCreateModal(true)}
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
      {/* Statistics */}
      <StatsGrid stats={statsData} />

      {/* Filters and Search */}
      <ContentCard title="Search & Filter" subtitle={null} actions={null}>
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-app-400" />
              <input
                type="text"
                placeholder="Search by name, phone, GST number..."
                className="w-full pl-10 pr-4 py-2 border border-app-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                    ? 'bg-primary-600 text-white'
                    : 'bg-app-100 text-app-700 hover:bg-app-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </ContentCard>

      {/* Customer List */}
      <ContentCard title="Customer List" subtitle={null} actions={null} className="overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center text-app-600">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mr-3"></div>
                Loading customers...
              </div>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="p-8 text-center">
              <Users className="w-12 h-12 text-app-400 mx-auto mb-4" />
              <p className="text-app-600">No customers found</p>
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
                <thead className="bg-app-50 border-b border-app-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-app-500 uppercase tracking-wider">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-app-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-app-500 uppercase tracking-wider">
                      License Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-app-500 uppercase tracking-wider">
                      Credit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-app-500 uppercase tracking-wider">
                      Outstanding
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-app-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-app-200">
                  {filteredCustomers.map((customer) => {
                    const licenseStatus = getLicenseStatus(customer.drug_license_validity);
                    
                    return (
                      <tr key={customer.customer_id} className="hover:bg-app-50 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <p className="text-sm font-medium text-app-800">
                              {customer.customer_name}
                            </p>
                            <p className="text-xs text-app-500 mt-1">
                              {customer.city || customer.state || 'Location not specified'}
                            </p>
                            {customer.gst_number && (
                              <p className="text-xs text-app-500">GST: {customer.gst_number}</p>
                            )}
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center text-sm text-app-600">
                              <Phone className="w-3 h-3 mr-1" />
                              {customer.primary_phone}
                            </div>
                            {customer.whatsapp_number && (
                              <div className="flex items-center text-sm text-success-600">
                                <MessageCircle className="w-3 h-3 mr-1" />
                                {customer.whatsapp_number}
                              </div>
                            )}
                            {customer.primary_email && (
                              <div className="flex items-center text-sm text-app-600">
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
                                ${licenseStatus.status === 'expired' ? 'bg-danger-100 text-danger-800 border border-danger-200' :
                                  licenseStatus.status === 'expiring' ? 'bg-warning-100 text-warning-800 border border-warning-200' :
                                  'bg-success-100 text-success-800 border border-success-200'}`}>
                                {licenseStatus.status === 'expired' && <X className="w-3 h-3 mr-1" />}
                                {licenseStatus.status === 'expiring' && <AlertTriangle className="w-3 h-3 mr-1" />}
                                {licenseStatus.status === 'valid' && <CheckCircle className="w-3 h-3 mr-1" />}
                                {licenseStatus.text}
                              </span>
                              <p className="text-xs text-app-500 mt-1">
                                {customer.drug_license_number}
                              </p>
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-app-100 text-app-600 border border-app-200">
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
                            <p className="text-sm text-app-600 mt-1">
                              ₹{((customer.credit_limit || 0) / 1000).toFixed(0)}k
                              {customer.credit_days && ` • ${customer.credit_days}d`}
                            </p>
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div>
                            <p className={`text-sm font-medium ${
                              (customer.current_outstanding || 0) > (customer.credit_limit || 0) 
                                ? 'text-danger-600' 
                                : 'text-app-800'
                            }`}>
                              ₹{((customer.current_outstanding || 0) / 1000).toFixed(1)}k
                            </p>
                            {customer.last_transaction_date && (
                              <p className="text-xs text-app-500 mt-1">
                                Last: {new Date(customer.last_transaction_date).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            customer.is_active !== false
                              ? 'bg-success-100 text-success-800'
                              : 'bg-app-100 text-app-600'
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
                              className="text-app-400 hover:text-app-600 transition-colors"
                              title="View Details"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedCustomer(customer);
                                setShowCreateModal(true);
                              }}
                              className="text-app-400 hover:text-primary-600 transition-colors"
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
      </ContentCard>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <CustomerCreationModal
          show={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedCustomer(null);
          }}
          onCustomerCreated={(customer) => {
            setCustomers(prev => [...prev, customer]);
            setShowCreateModal(false);
            setSelectedCustomer(null);
            toast.created('Customer');
          }}
        />
      )}

      {/* Customer Details Modal */}
      {showDetails && selectedCustomer && (
        <BaseModal
          open={showDetails}
          onClose={() => setShowDetails(false)}
          title="Customer Details"
          subtitle={selectedCustomer.customer_name}
          icon={User}
          footerActions={null}
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
                  <p className="text-sm text-app-500">Contact</p>
                  <p className="text-sm font-medium">{selectedCustomer.primary_phone}</p>
                  {selectedCustomer.whatsapp_number && (
                    <p className="text-sm text-success-600">WhatsApp: {selectedCustomer.whatsapp_number}</p>
                  )}
                </div>
                
                <div>
                  <p className="text-sm text-app-500">Outstanding</p>
                  <p className="text-sm font-medium">₹{(selectedCustomer.current_outstanding || 0).toLocaleString()}</p>
                  <p className="text-xs text-app-500">Limit: ₹{(selectedCustomer.credit_limit || 0).toLocaleString()}</p>
                </div>
                
                <div>
                  <p className="text-sm text-app-500">Drug License</p>
                  <p className="text-sm font-medium">{selectedCustomer.drug_license_number || 'Not provided'}</p>
                  {selectedCustomer.drug_license_validity && (
                    <p className="text-xs text-app-500">Valid till: {new Date(selectedCustomer.drug_license_validity).toLocaleDateString()}</p>
                  )}
                </div>
                
                <div>
                  <p className="text-sm text-app-500">GST Number</p>
                  <p className="text-sm font-medium">{selectedCustomer.gst_number || 'Not provided'}</p>
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <p className="text-sm text-app-500">Address</p>
                <p className="text-sm">{selectedCustomer.address}</p>
                <p className="text-sm">{selectedCustomer.city}, {selectedCustomer.state} - {selectedCustomer.pincode}</p>
              </div>
            </div>
          </div>
        </BaseModal>
      )}
    </GlobalLayout>
  );
};

export default CustomerMaster;