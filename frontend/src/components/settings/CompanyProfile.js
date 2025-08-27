import React, { useState, useEffect } from 'react';
import { 
  Building2, Phone, Mail, MapPin, Globe, FileText, 
  Save, Edit2, Upload, X, Check, AlertCircle 
} from 'lucide-react';
import { companyAPI } from '../../services/api';

const CompanyProfile = () => {
  const [companyInfo, setCompanyInfo] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    gst: '',
    pan: '',
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
      
      const response = await companyAPI.getCompanyInfo();
      if (response) {
        setCompanyInfo(response);
        if (response.logo) {
          setLogoPreview(response.logo);
        }
      }
    } catch (error) {
      console.error('Error fetching company profile:', error);
      setError('Failed to load company profile');
      // Use default values if fetch fails
      const defaultInfo = {
        name: 'Your Company Name',
        address: 'Company Address',
        phone: '+91 00000 00000',
        email: 'info@company.com',
        gst: '',
        pan: '',
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
      
      // Save company info
      await companyAPI.updateCompanyInfo(companyInfo);
      
      // Upload logo if changed
      if (logoFile) {
        // This would need a separate endpoint for file upload
        // For now, we'll include it in the company info as base64
        const updatedInfo = {
          ...companyInfo,
          logo: logoPreview
        };
        await companyAPI.updateCompanyInfo(updatedInfo);
      }
      
      setSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSuccess(false), 3000);
      
      // Store in localStorage for quick access
      localStorage.setItem('companyInfo', JSON.stringify(companyInfo));
      
    } catch (error) {
      console.error('Error saving company profile:', error);
      setError('Failed to save company profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setError(null);
    fetchCompanyProfile(); // Reset to original values
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-auto" style={{ maxHeight: 'calc(100vh - 64px)' }}>
      <div className="max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Company Profile
        </h2>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Edit2 className="w-4 h-4" />
            Edit Profile
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Changes
            </button>
          </div>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <span className="text-red-800">{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
          <Check className="w-5 h-5 text-green-600 mt-0.5" />
          <span className="text-green-800">Company profile updated successfully!</span>
        </div>
      )}

      {/* Company Logo */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Company Logo
        </label>
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 border-2 border-gray-200 rounded-lg overflow-hidden bg-gray-50">
            {logoPreview ? (
              <img 
                src={logoPreview} 
                alt="Company Logo" 
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Building2 className="w-8 h-8 text-gray-400" />
              </div>
            )}
          </div>
          {isEditing && (
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="hidden"
              />
              <div className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
                <Upload className="w-4 h-4" />
                Upload Logo
              </div>
            </label>
          )}
        </div>
      </div>

      {/* Company Information Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Company Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company Name *
          </label>
          <input
            type="text"
            name="name"
            value={companyInfo.name}
            onChange={handleInputChange}
            disabled={!isEditing}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            required
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              required
            />
          </div>
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              required
            />
          </div>
        </div>

        {/* Website */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        </div>

        {/* GST Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        </div>

        {/* PAN Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            PAN Number
          </label>
          <div className="relative">
            <FileText className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              name="pan"
              value={companyInfo.pan}
              onChange={handleInputChange}
              disabled={!isEditing}
              placeholder="ABCDE1234F"
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
        </div>

        {/* Address */}
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Address *
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <textarea
              name="address"
              value={companyInfo.address}
              onChange={handleInputChange}
              disabled={!isEditing}
              rows={2}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              required
            />
          </div>
        </div>

        {/* City */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            City
          </label>
          <input
            type="text"
            name="city"
            value={companyInfo.city}
            onChange={handleInputChange}
            disabled={!isEditing}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        {/* State */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            State
          </label>
          <input
            type="text"
            name="state"
            value={companyInfo.state}
            onChange={handleInputChange}
            disabled={!isEditing}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        {/* Pincode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pincode
          </label>
          <input
            type="text"
            name="pincode"
            value={companyInfo.pincode}
            onChange={handleInputChange}
            disabled={!isEditing}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        {/* Country */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Country
          </label>
          <input
            type="text"
            name="country"
            value={companyInfo.country}
            onChange={handleInputChange}
            disabled={!isEditing}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>
      </div>
        </div>
      </div>
    </div>
  );
};

export default CompanyProfile;