import React, { useState, useEffect } from 'react';
import { 
  Truck, Search, Plus, Edit2, Filter, Download, Upload,
  Phone, Mail, MapPin, AlertTriangle, CheckCircle, 
  Star, Building2, Calendar, TrendingUp, CreditCard,
  Shield, Clock, User, X, ChevronRight, FileText,
  AlertCircle, MessageCircle, Banknote, Award
} from 'lucide-react';
import { Card, Button, Badge, DataTable, Modal } from '../global';
import { theme, classes } from '../../config/theme.config';
import { suppliersApi } from '../../services/api';
import SupplierCreationModal from '../global/modals/SupplierCreationModal';

interface Supplier {
  supplier_id: number;
  supplier_name: string;
  supplier_type: string;
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
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  account_holder_name?: string;
  payment_days?: number;
  supplier_category?: string;
  quality_rating?: number;
  delivery_rating?: number;
  compliance_rating?: string;
  is_active?: boolean;
  last_transaction_date?: string;
  total_business_amount?: number;
}

const SupplierMaster: React.FC = () => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const response = await suppliersApi.getAll();
      const supplierData = response.data?.data || response.data || [];
      setSuppliers(supplierData);
    } catch (error) {
      console.error('Error loading suppliers:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = 
      supplier.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.primary_phone?.includes(searchTerm) ||
      supplier.gst_number?.includes(searchTerm) ||
      supplier.bank_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = 
      filterStatus === 'all' || 
      (filterStatus === 'active' && supplier.is_active !== false) ||
      (filterStatus === 'inactive' && supplier.is_active === false);
    
    const matchesCategory = 
      filterCategory === 'all' || 
      supplier.supplier_category === filterCategory;
    
    return matchesSearch && matchesStatus && matchesCategory;
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

  const getRatingStars = (rating?: number) => {
    if (!rating) return null;
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    return (
      <div className="flex items-center">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`w-3 h-3 ${
              i < fullStars 
                ? 'text-yellow-400 fill-yellow-400' 
                : i === fullStars && hasHalfStar
                ? 'text-yellow-400 fill-yellow-200'
                : 'text-gray-300'
            }`}
          />
        ))}
        <span className="ml-1 text-xs text-gray-600">{rating.toFixed(1)}</span>
      </div>
    );
  };

  const getComplianceRatingBadge = (rating?: string) => {
    const colors = {
      'excellent': 'bg-green-100 text-green-800 border-green-200',
      'good': 'bg-blue-100 text-blue-800 border-blue-200',
      'average': 'bg-amber-100 text-amber-800 border-amber-200',
      'poor': 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[rating as keyof typeof colors] || 'bg-gray-100 text-gray-600 border-gray-200';
  };

  // Statistics Cards
  const stats = {
    total: suppliers.length,
    active: suppliers.filter(s => s.is_active !== false).length,
    withLicense: suppliers.filter(s => s.drug_license_number).length,
    withBankDetails: suppliers.filter(s => s.bank_name && s.account_number).length,
    preferredSuppliers: suppliers.filter(s => s.supplier_category === 'preferred').length,
    avgQualityRating: suppliers.reduce((sum, s) => sum + (s.quality_rating || 0), 0) / suppliers.length || 0
  };

  return (
    <div className="h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Truck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Supplier Master</h1>
              <p className="text-sm text-gray-500">Manage your supplier network</p>
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
              Add Supplier
            </Button>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">Total Suppliers</p>
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              </div>
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Truck className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats.active}</p>
              </div>
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">Licensed</p>
                <p className="text-2xl font-bold text-blue-600">{stats.withLicense}</p>
              </div>
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">Bank Verified</p>
                <p className="text-2xl font-bold text-teal-600">{stats.withBankDetails}</p>
              </div>
              <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
                <Banknote className="w-5 h-5 text-teal-600" />
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">Preferred</p>
                <p className="text-2xl font-bold text-indigo-600">{stats.preferredSuppliers}</p>
              </div>
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Award className="w-5 h-5 text-indigo-600" />
              </div>
            </div>
          </Card>
          
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">Avg Quality</p>
                <div className="mt-1">{getRatingStars(stats.avgQualityRating)}</div>
              </div>
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Star className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
          </Card>
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
                  placeholder="Search by name, phone, GST, bank..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
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
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
            
            {/* Category Filter */}
            <select
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="all">All Categories</option>
              <option value="preferred">Preferred</option>
              <option value="regular">Regular</option>
              <option value="new">New</option>
            </select>
          </div>
        </Card>
      </div>

      {/* Supplier List */}
      <div className="px-6 pb-6">
        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-flex items-center text-gray-600">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mr-3"></div>
                Loading suppliers...
              </div>
            </div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="p-8 text-center">
              <Truck className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No suppliers found</p>
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onClick={() => setShowCreateModal(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add First Supplier
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Supplier
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      License Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Banking
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ratings
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
                  {filteredSuppliers.map((supplier) => {
                    const licenseStatus = getLicenseStatus(supplier.drug_license_validity);
                    
                    return (
                      <tr key={supplier.supplier_id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <div className="flex items-center">
                              <p className="text-sm font-medium text-gray-900">
                                {supplier.supplier_name}
                              </p>
                              {supplier.supplier_category === 'preferred' && (
                                <Award className="w-4 h-4 text-indigo-600 ml-2" />
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {supplier.supplier_type} • {supplier.city}
                            </p>
                            {supplier.gst_number && (
                              <p className="text-xs text-gray-500">GST: {supplier.gst_number}</p>
                            )}
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center text-sm text-gray-600">
                              <Phone className="w-3 h-3 mr-1" />
                              {supplier.primary_phone}
                            </div>
                            {supplier.whatsapp_number && (
                              <div className="flex items-center text-sm text-green-600">
                                <MessageCircle className="w-3 h-3 mr-1" />
                                {supplier.whatsapp_number}
                              </div>
                            )}
                            {supplier.primary_email && (
                              <div className="flex items-center text-sm text-gray-600">
                                <Mail className="w-3 h-3 mr-1" />
                                {supplier.primary_email}
                              </div>
                            )}
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          {supplier.drug_license_number ? (
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
                                {supplier.drug_license_number}
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
                          {supplier.bank_name && supplier.account_number ? (
                            <div>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800 border border-teal-200">
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Verified
                              </span>
                              <p className="text-xs text-gray-500 mt-1">
                                {supplier.bank_name}
                              </p>
                              <p className="text-xs text-gray-500">
                                {supplier.payment_days ? `${supplier.payment_days} days` : 'COD'}
                              </p>
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Bank Details Missing
                            </span>
                          )}
                        </td>
                        
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            {supplier.quality_rating && (
                              <div className="flex items-center">
                                <span className="text-xs text-gray-500 mr-2">Quality:</span>
                                {getRatingStars(supplier.quality_rating)}
                              </div>
                            )}
                            {supplier.delivery_rating && (
                              <div className="flex items-center">
                                <span className="text-xs text-gray-500 mr-2">Delivery:</span>
                                {getRatingStars(supplier.delivery_rating)}
                              </div>
                            )}
                            {supplier.compliance_rating && (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getComplianceRatingBadge(supplier.compliance_rating)}`}>
                                {supplier.compliance_rating}
                              </span>
                            )}
                          </div>
                        </td>
                        
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            supplier.is_active !== false
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {supplier.is_active !== false ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedSupplier(supplier);
                                setShowDetails(true);
                              }}
                              className="text-gray-400 hover:text-gray-600 transition-colors"
                              title="View Details"
                            >
                              <ChevronRight className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => {
                                setSelectedSupplier(supplier);
                                setShowCreateModal(true);
                              }}
                              className="text-gray-400 hover:text-purple-600 transition-colors"
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
        <SupplierCreationModal
          show={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setSelectedSupplier(null);
          }}
          onSupplierCreated={(supplier) => {
            loadSuppliers();
            setShowCreateModal(false);
            setSelectedSupplier(null);
          }}
          existingSupplier={selectedSupplier}
        />
      )}

      {/* Supplier Details Modal */}
      {showDetails && selectedSupplier && (
        <Modal
          isOpen={showDetails}
          onClose={() => setShowDetails(false)}
          title="Supplier Details"
          size="lg"
        >
          <div className="p-6">
            {/* Supplier details content */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{selectedSupplier.supplier_name}</h3>
                {selectedSupplier.compliance_rating && (
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getComplianceRatingBadge(selectedSupplier.compliance_rating)}`}>
                    Compliance: {selectedSupplier.compliance_rating}
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Contact</p>
                  <p className="text-sm font-medium">{selectedSupplier.primary_phone}</p>
                  {selectedSupplier.whatsapp_number && (
                    <p className="text-sm text-green-600">WhatsApp: {selectedSupplier.whatsapp_number}</p>
                  )}
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Banking Details</p>
                  <p className="text-sm font-medium">{selectedSupplier.bank_name || 'Not provided'}</p>
                  {selectedSupplier.account_number && (
                    <p className="text-xs text-gray-500">A/C: ****{selectedSupplier.account_number.slice(-4)}</p>
                  )}
                  {selectedSupplier.ifsc_code && (
                    <p className="text-xs text-gray-500">IFSC: {selectedSupplier.ifsc_code}</p>
                  )}
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Drug License</p>
                  <p className="text-sm font-medium">{selectedSupplier.drug_license_number || 'Not provided'}</p>
                  {selectedSupplier.drug_license_validity && (
                    <p className="text-xs text-gray-500">Valid till: {new Date(selectedSupplier.drug_license_validity).toLocaleDateString()}</p>
                  )}
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">GST Number</p>
                  <p className="text-sm font-medium">{selectedSupplier.gst_number || 'Not provided'}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Payment Terms</p>
                  <p className="text-sm font-medium">{selectedSupplier.payment_days ? `${selectedSupplier.payment_days} days credit` : 'COD'}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Ratings</p>
                  <div className="space-y-1">
                    {selectedSupplier.quality_rating && (
                      <div className="flex items-center">
                        <span className="text-xs mr-1">Quality:</span>
                        {getRatingStars(selectedSupplier.quality_rating)}
                      </div>
                    )}
                    {selectedSupplier.delivery_rating && (
                      <div className="flex items-center">
                        <span className="text-xs mr-1">Delivery:</span>
                        {getRatingStars(selectedSupplier.delivery_rating)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="pt-4 border-t">
                <p className="text-sm text-gray-500">Address</p>
                <p className="text-sm">{selectedSupplier.address}</p>
                <p className="text-sm">{selectedSupplier.city}, {selectedSupplier.state} - {selectedSupplier.pincode}</p>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default SupplierMaster;