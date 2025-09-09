import React, { useState, useEffect } from 'react';
import { X, User, Phone, Mail, MapPin, Building, FileText, Shield, Calendar, CreditCard, MessageCircle, AlertCircle } from 'lucide-react';
import { customerAPI } from '../../../services/api';
import DataTransformer from '../../../services/dataTransformer';
import { APP_CONFIG } from '../../../config/app.config';

const CustomerCreationModal = ({ show, onClose, onCustomerCreated }) => {
  const [isBusinessCustomer, setIsBusinessCustomer] = useState(true); // Toggle for Business vs Individual
  const [newCustomer, setNewCustomer] = useState({
    customer_name: '',
    primary_phone: '',
    primary_email: '',
    whatsapp_number: '',  // NEW: Critical for communication
    customer_type: 'pharmacy',
    gst_number: '',
    pan_number: '',
    drug_license_number: '',
    drug_license_validity: '',  // NEW: Critical for compliance
    credit_limit: 5000,
    credit_days: 0,
    credit_rating: 'B',  // NEW: Critical for credit management
    // Note: salesperson/territory/route fields removed for production - not essential for core customer creation
    address: {
      address_line1: '',
      address_line2: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India'
    }
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  // Removed: salesperson/territory/route state - not essential for production

  // Removed: dropdown loading logic - not needed for production customer creation

  const saveCustomer = async () => {
    setSaving(true);
    setErrors([]);
    try {
      const customerData = DataTransformer.prepareCustomerForAPI({
        ...newCustomer,
        org_id: localStorage.getItem('pharma_org_id') || sessionStorage.getItem('pharma_org_id')
      });

      const response = await customerAPI.create(customerData);
      
      // The API returns the created customer directly, not wrapped in data
      if (response) {
        const createdCustomer = DataTransformer.transformCustomer(response, 'display');
        
        if (onCustomerCreated) {
          onCustomerCreated(createdCustomer);
        }
        
        // Reset form
        setNewCustomer({
          customer_name: '',
          primary_phone: '',
          primary_email: '',
          whatsapp_number: '',
          customer_type: isBusinessCustomer ? 'pharmacy' : 'individual',
          gst_number: '',
          pan_number: '',
          drug_license_number: '',
          drug_license_validity: '',
          credit_limit: 5000,
          credit_days: 0,
          credit_rating: 'B',
          address: {
            address_line1: '',
            address_line2: '',
            city: '',
            state: '',
            pincode: '',
            country: 'India'
          }
        });
        
        // Close modal
        onClose();
      } else {
        setErrors(['Customer created but response format unexpected']);
      }
    } catch (error) {
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          setErrors(error.response.data.detail.map(err => {
            if (typeof err === 'string') {
              return err;
            } else if (err.msg) {
              return err.loc ? `${err.loc.join('.')} - ${err.msg}` : err.msg;
            } else {
              return JSON.stringify(err);
            }
          }));
        } else if (typeof error.response.data.detail === 'string') {
          setErrors([error.response.data.detail]);
        } else {
          setErrors([JSON.stringify(error.response.data.detail)]);
        }
      } else {
        setErrors(['Failed to save customer']);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden transform transition-all animate-slide-up">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-50 to-white px-8 py-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-gray-900">Add New Customer</h3>
                <p className="text-sm text-gray-500 mt-1">Create a new customer profile</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200 group"
            >
              <X className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-8 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="space-y-6">
            {/* Customer Type Toggle */}
            <div className="flex items-center justify-center space-x-1 bg-gray-100 rounded-xl p-1">
              <button
                type="button"
                onClick={() => {
                  setIsBusinessCustomer(true);
                  setNewCustomer({ ...newCustomer, customer_type: 'pharmacy' });
                }}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  isBusinessCustomer
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <Building className="inline-block w-4 h-4 mr-2" />
                Business
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsBusinessCustomer(false);
                  setNewCustomer({ ...newCustomer, customer_type: 'individual' });
                }}
                className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  !isBusinessCustomer
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <User className="inline-block w-4 h-4 mr-2" />
                Individual
              </button>
            </div>

            {/* Basic Information */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Basic Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Customer Name *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={newCustomer.customer_name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, customer_name: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Enter customer name"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number *
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={newCustomer.primary_phone}
                      onChange={(e) => setNewCustomer({ ...newCustomer, primary_phone: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Enter phone number"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    WhatsApp Number
                  </label>
                  <div className="relative">
                    <MessageCircle className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-green-500" />
                    <input
                      type="text"
                      value={newCustomer.whatsapp_number}
                      onChange={(e) => setNewCustomer({ ...newCustomer, whatsapp_number: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="WhatsApp number"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={newCustomer.primary_email}
                      onChange={(e) => setNewCustomer({ ...newCustomer, primary_email: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Enter email address"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Address Information */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Address Information</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Address *
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                    <textarea
                      value={newCustomer.address.address_line1}
                      onChange={(e) => setNewCustomer({ ...newCustomer, address: { ...newCustomer.address, address_line1: e.target.value } })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                      rows="2"
                      placeholder="Enter complete address"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      City *
                    </label>
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={newCustomer.address.city}
                        onChange={(e) => setNewCustomer({ ...newCustomer, address: { ...newCustomer.address, city: e.target.value } })}
                        className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                        placeholder="Enter city"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      State *
                    </label>
                    <select
                      value={newCustomer.address.state}
                      onChange={(e) => setNewCustomer({ ...newCustomer, address: { ...newCustomer.address, state: e.target.value } })}
                      className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    >
                      <option value="">Select State</option>
                      <option value="Andhra Pradesh">Andhra Pradesh</option>
                      <option value="Arunachal Pradesh">Arunachal Pradesh</option>
                      <option value="Assam">Assam</option>
                      <option value="Bihar">Bihar</option>
                      <option value="Chhattisgarh">Chhattisgarh</option>
                      <option value="Goa">Goa</option>
                      <option value="Gujarat">Gujarat</option>
                      <option value="Haryana">Haryana</option>
                      <option value="Himachal Pradesh">Himachal Pradesh</option>
                      <option value="Jharkhand">Jharkhand</option>
                      <option value="Karnataka">Karnataka</option>
                      <option value="Kerala">Kerala</option>
                      <option value="Madhya Pradesh">Madhya Pradesh</option>
                      <option value="Maharashtra">Maharashtra</option>
                      <option value="Manipur">Manipur</option>
                      <option value="Meghalaya">Meghalaya</option>
                      <option value="Mizoram">Mizoram</option>
                      <option value="Nagaland">Nagaland</option>
                      <option value="Odisha">Odisha</option>
                      <option value="Punjab">Punjab</option>
                      <option value="Rajasthan">Rajasthan</option>
                      <option value="Sikkim">Sikkim</option>
                      <option value="Tamil Nadu">Tamil Nadu</option>
                      <option value="Telangana">Telangana</option>
                      <option value="Tripura">Tripura</option>
                      <option value="Uttar Pradesh">Uttar Pradesh</option>
                      <option value="Uttarakhand">Uttarakhand</option>
                      <option value="West Bengal">West Bengal</option>
                      <option value="Andaman and Nicobar Islands">Andaman and Nicobar Islands</option>
                      <option value="Chandigarh">Chandigarh</option>
                      <option value="Dadra and Nagar Haveli and Daman and Diu">Dadra and Nagar Haveli and Daman and Diu</option>
                      <option value="Delhi">Delhi</option>
                      <option value="Jammu and Kashmir">Jammu and Kashmir</option>
                      <option value="Ladakh">Ladakh</option>
                      <option value="Lakshadweep">Lakshadweep</option>
                      <option value="Puducherry">Puducherry</option>
                    </select>
                  </div>
                </div>
                
                <div className={`grid ${isBusinessCustomer ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pincode *
                    </label>
                    <input
                      type="text"
                      value={newCustomer.address.pincode}
                      onChange={(e) => setNewCustomer({ ...newCustomer, address: { ...newCustomer.address, pincode: e.target.value } })}
                      className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="Enter pincode"
                      maxLength="6"
                    />
                  </div>
                  
                  {isBusinessCustomer && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Business Type *
                      </label>
                      <select
                        value={newCustomer.customer_type}
                        onChange={(e) => setNewCustomer({ ...newCustomer, customer_type: e.target.value })}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      >
                        <option value="pharmacy">Pharmacy</option>
                        <option value="hospital">Hospital</option>
                        <option value="clinic">Clinic</option>
                        <option value="institution">Institution</option>
                        <option value="doctor">Doctor</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Compliance Information - CRITICAL - Only for Business Customers */}
            {isBusinessCustomer && (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center">
                  <Shield className="w-4 h-4 text-red-500 mr-2" />
                  Compliance Information (Required for Pharmacy/Hospital)
                </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Drug License Number *
                  </label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={newCustomer.drug_license_number}
                      onChange={(e) => setNewCustomer({ ...newCustomer, drug_license_number: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="e.g., DL-MH-12345"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    License Validity Date *
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="date"
                      value={newCustomer.drug_license_validity}
                      onChange={(e) => setNewCustomer({ ...newCustomer, drug_license_validity: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  {newCustomer.drug_license_validity && new Date(newCustomer.drug_license_validity) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      License expiring soon
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GST Number
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={newCustomer.gst_number}
                      onChange={(e) => setNewCustomer({ ...newCustomer, gst_number: e.target.value.toUpperCase() })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="e.g., 27ABCDE1234F1Z5"
                      maxLength="15"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PAN Number
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={newCustomer.pan_number}
                      onChange={(e) => setNewCustomer({ ...newCustomer, pan_number: e.target.value.toUpperCase() })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                      placeholder="e.g., ABCDE1234F"
                      maxLength="10"
                    />
                  </div>
                </div>
              </div>
            </div>
            )}

            {/* Credit Management - CRITICAL - Only for Business Customers */}
            {isBusinessCustomer && (
              <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center">
                <CreditCard className="w-4 h-4 text-blue-500 mr-2" />
                Credit Management
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Credit Rating *
                  </label>
                  <select
                    value={newCustomer.credit_rating}
                    onChange={(e) => setNewCustomer({ ...newCustomer, credit_rating: e.target.value })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                  >
                    <option value="A">A - Excellent (Low Risk)</option>
                    <option value="B">B - Good (Medium Risk)</option>
                    <option value="C">C - Fair (High Risk)</option>
                    <option value="D">D - Poor (Cash Only)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Credit Limit (₹)
                  </label>
                  <input
                    type="number"
                    value={newCustomer.credit_limit}
                    onChange={(e) => setNewCustomer({ ...newCustomer, credit_limit: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Enter credit limit"
                    min="0"
                    disabled={newCustomer.credit_rating === 'D'}
                  />
                  {newCustomer.credit_rating === 'D' && (
                    <p className="text-xs text-red-600 mt-1">D-rated customers must pay cash</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Credit Days
                  </label>
                  <input
                    type="number"
                    value={newCustomer.credit_days}
                    onChange={(e) => setNewCustomer({ ...newCustomer, credit_days: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="Payment terms in days"
                    min="0"
                    max="90"
                    disabled={newCustomer.credit_rating === 'D'}
                  />
                </div>
              </div>
            </div>
            )}

            {/* Sales & Territory Management removed - not essential for core customer creation */}

            {/* Error Messages */}
            {errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="text-sm text-red-600 space-y-1">
                  {errors.map((error, index) => (
                    <div key={index} className="flex items-start">
                      <span className="block w-1 h-1 bg-red-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="px-8 py-6 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-6 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-100 transition-all duration-200 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={saveCustomer}
            disabled={saving || !newCustomer.customer_name || !newCustomer.primary_phone || !newCustomer.address.address_line1 || !newCustomer.address.city || !newCustomer.address.state || !newCustomer.address.pincode || (isBusinessCustomer && !newCustomer.customer_type)}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center space-x-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Customer</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomerCreationModal;