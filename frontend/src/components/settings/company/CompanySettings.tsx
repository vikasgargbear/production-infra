import React, { useState, useEffect } from 'react';
import {
  Building2, Phone, Mail, MapPin, Globe, FileText,
  Save, Edit2, Upload, X, Check, AlertCircle, Loader2
} from 'lucide-react';
import { companyApi } from '../../../services/api';

const CompanySettings = () => {
  const [companyInfo, setCompanyInfo] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    gst: '',
    pan_number: '',
    website: '',
    logo: null,
    city: '',
    state: '',
    pincode: '',
    country: 'India'
  });

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  // Fetch company profile on mount
  useEffect(() => {
    fetchCompanyProfile();
  }, []);

  const fetchCompanyProfile = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await companyApi.getCompanyInfo();

      if (response) {
        setCompanyInfo(response);
        if (response.logo) {
          setLogoPreview(response.logo);
        }
      }
    } catch (error) {
      let errorMessage = 'Failed to load company profile';
      if (error.response?.data?.detail) {
        if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        } else if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail
            .map(err => typeof err === 'string' ? err : (err.msg || JSON.stringify(err)))
            .join(', ');
        } else {
          errorMessage = JSON.stringify(error.response.data.detail);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      setError(errorMessage);

      // Use default values if fetch fails
      const defaultInfo = {
        name: 'Your Company Name',
        address: 'Company Address',
        phone: '+91 00000 00000',
        email: 'info@company.com',
        gst: '',
        pan_number: '',
        website: '',
        logo: null,
        city: '',
        state: '',
        pincode: '',
        country: 'India'
      };
      setCompanyInfo(defaultInfo);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCompanyInfo(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        setError('Logo file size must be less than 2MB');
        return;
      }

      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      // Prepare data for saving
      const dataToSave = {
        ...companyInfo,
        logo: logoPreview // Include base64 logo if changed
      };

      // Save company info using the correct API
      const response = await companyApi.updateCompanyInfo(dataToSave);

      setCompanyInfo(response);
      setSuccess(true);
      setIsEditing(false);

      // Store in localStorage for quick access
      localStorage.setItem('companyInfo', JSON.stringify(response));

      // Hide success message after 3 seconds
      setTimeout(() => setSuccess(false), 3000);

    } catch (error) {
      let errorMessage = 'Failed to save company profile';
      if (error.response?.data?.detail) {
        if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        } else if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail
            .map(err => typeof err === 'string' ? err : (err.msg || JSON.stringify(err)))
            .join(', ');
        } else {
          errorMessage = JSON.stringify(error.response.data.detail);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
    setLogoFile(null);
    fetchCompanyProfile(); // Reset to original values
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="w-full h-full">
      <div className="max-w-6xl mx-auto p-4 pb-20">
        <div className="bg-white rounded-lg shadow-sm">
          {/* Header */}
          <div className="border-b px-6 py-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Company Settings
              </h2>
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Profile
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleCancel}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            {/* Alerts */}
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <span className="text-red-800">{error}</span>
              </div>
            )}

            {success && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
                <Check className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                <span className="text-green-800">Company profile updated successfully!</span>
              </div>
            )}

            {/* Company Logo Section */}
            <div className="mb-8 pb-8 border-b">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Company Logo</h3>
              <div className="flex items-start gap-6">
                <div className="flex-shrink-0">
                  <div className="w-32 h-32 border-2 border-gray-200 rounded-lg overflow-hidden bg-gray-50">
                    {logoPreview ? (
                      <img
                        src={logoPreview}
                        alt="Company Logo"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Building2 className="w-12 h-12 text-gray-400" />
                      </div>
                    )}
                  </div>
                </div>
                {isEditing && (
                  <div className="flex-1">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoChange}
                        className="hidden"
                      />
                      <div className="inline-flex px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 items-center gap-2 transition-colors">
                        <Upload className="w-4 h-4" />
                        Change Logo
                      </div>
                    </label>
                    <p className="mt-2 text-sm text-gray-500">
                      PNG, JPG up to 2MB
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Company Information Form */}
            <div className="space-y-8">
              {/* Basic Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Company Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Company Name *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={companyInfo.name}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 transition-colors"
                      required
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address *
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <input
                        type="email"
                        name="email"
                        value={companyInfo.email}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 transition-colors"
                        required
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phone Number *
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <input
                        type="tel"
                        name="phone"
                        value={companyInfo.phone}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 transition-colors"
                        required
                      />
                    </div>
                  </div>

                  {/* Website */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Website
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <input
                        type="url"
                        name="website"
                        value={companyInfo.website}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="https://example.com"
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Tax Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Tax Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* GST Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      GST Number
                    </label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        name="gst"
                        value={companyInfo.gst}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="29ABCDE1234F1Z5"
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 transition-colors"
                      />
                    </div>
                  </div>

                  {/* PAN Number */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      PAN Number
                    </label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        name="pan_number"
                        value={companyInfo.pan_number}
                        onChange={handleInputChange}
                        disabled={!isEditing}
                        placeholder="ABCDE1234F"
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Address Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Address Information</h3>

                {/* Address */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Street Address *
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <textarea
                      name="address"
                      value={companyInfo.address}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      rows={3}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 transition-colors resize-none"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* City */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      City
                    </label>
                    <input
                      type="text"
                      name="city"
                      value={companyInfo.city}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 transition-colors"
                    />
                  </div>

                  {/* State */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      State
                    </label>
                    <input
                      type="text"
                      name="state"
                      value={companyInfo.state}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 transition-colors"
                    />
                  </div>

                  {/* Pincode */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Pincode
                    </label>
                    <input
                      type="text"
                      name="pincode"
                      value={companyInfo.pincode}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      pattern="[0-9]{6}"
                      maxLength="6"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 transition-colors"
                    />
                  </div>

                  {/* Country */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Country
                    </label>
                    <input
                      type="text"
                      name="country"
                      value={companyInfo.country}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500 transition-colors"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanySettings;