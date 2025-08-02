import React, { useState } from 'react';
import { Upload, Image, X, Save, Building, Phone, Mail, MapPin, CreditCard, FileText, Shield } from 'lucide-react';

const Profile = () => {
  const [companyLogo, setCompanyLogo] = useState(localStorage.getItem('companyLogo') || null);
  const [companyData, setCompanyData] = useState({
    name: localStorage.getItem('companyName') || 'AASO PHARMACEUTICALS',
    address: localStorage.getItem('companyAddress') || 'Gangapur City, Rajasthan',
    phone: localStorage.getItem('companyPhone') || '+91 98765 43210',
    email: localStorage.getItem('companyEmail') || 'info@aasopharma.com',
    gst: localStorage.getItem('companyGST') || '08AAXCA4042N1Z2',
    drugLicense: localStorage.getItem('companyDrugLicense') || 'DL-RJ-GPC-2024-001',
    bankName: localStorage.getItem('companyBankName') || '',
    accountNumber: localStorage.getItem('companyAccountNumber') || '',
    ifscCode: localStorage.getItem('companyIfscCode') || '',
    upiId: localStorage.getItem('companyUpiId') || ''
  });

  const handleLogoUpload = async (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const logoUrl = e.target.result;
        setCompanyLogo(logoUrl);
        localStorage.setItem('companyLogo', logoUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    localStorage.setItem('companyName', companyData.name);
    localStorage.setItem('companyAddress', companyData.address);
    localStorage.setItem('companyPhone', companyData.phone);
    localStorage.setItem('companyEmail', companyData.email);
    localStorage.setItem('companyGST', companyData.gst);
    localStorage.setItem('companyDrugLicense', companyData.drugLicense);
    localStorage.setItem('companyBankName', companyData.bankName);
    localStorage.setItem('companyAccountNumber', companyData.accountNumber);
    localStorage.setItem('companyIfscCode', companyData.ifscCode);
    localStorage.setItem('companyUpiId', companyData.upiId);
    
    alert('Company profile updated successfully!');
  };

  const handleInputChange = (field, value) => {
    setCompanyData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mr-4">
              <Building className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Company Profile</h1>
              <p className="text-gray-600">Manage your business information and branding</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Logo Upload Section */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Image className="w-5 h-5 mr-2 text-blue-600" />
                Company Logo
              </h2>

              <div className="space-y-4">
                {companyLogo ? (
                  <div className="relative">
                    <img 
                      src={companyLogo} 
                      alt="Company Logo" 
                      className="w-full h-48 object-contain rounded-lg border-2 border-gray-200 bg-gray-50"
                    />
                    <button
                      onClick={() => {
                        setCompanyLogo(null);
                        localStorage.removeItem('companyLogo');
                      }}
                      className="absolute top-2 right-2 p-2 bg-white rounded-full shadow-md hover:bg-red-50 transition-colors"
                    >
                      <X className="w-4 h-4 text-red-600" />
                    </button>
                  </div>
                ) : (
                  <div className="w-full h-48 bg-gray-100 rounded-lg flex flex-col items-center justify-center border-2 border-dashed border-gray-300">
                    <Image className="w-12 h-12 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">No logo uploaded</p>
                  </div>
                )}

                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <div className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors cursor-pointer text-center">
                    <Upload className="w-4 h-4 inline mr-2" />
                    {companyLogo ? 'Change Logo' : 'Upload Logo'}
                  </div>
                </label>
                <p className="text-xs text-gray-500 text-center">PNG or JPG, max 2MB</p>
              </div>
            </div>
          </div>

          {/* Company Information */}
          <div className="lg:col-span-2 space-y-6">
            {/* Basic Information */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Building className="w-5 h-5 mr-2 text-blue-600" />
                Basic Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                  <input
                    type="text"
                    value={companyData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GST Number</label>
                  <input
                    type="text"
                    value={companyData.gst}
                    onChange={(e) => handleInputChange('gst', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={companyData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={companyData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    value={companyData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Drug License Number</label>
                  <input
                    type="text"
                    value={companyData.drugLicense}
                    onChange={(e) => handleInputChange('drugLicense', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Banking Information */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <CreditCard className="w-5 h-5 mr-2 text-green-600" />
                Banking Information
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                  <input
                    type="text"
                    value={companyData.bankName}
                    onChange={(e) => handleInputChange('bankName', e.target.value)}
                    placeholder="State Bank of India"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Number</label>
                  <input
                    type="text"
                    value={companyData.accountNumber}
                    onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                    placeholder="1234567890"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IFSC Code</label>
                  <input
                    type="text"
                    value={companyData.ifscCode}
                    onChange={(e) => handleInputChange('ifscCode', e.target.value)}
                    placeholder="SBIN0001234"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID</label>
                  <input
                    type="text"
                    value={companyData.upiId}
                    onChange={(e) => handleInputChange('upiId', e.target.value)}
                    placeholder="business@upi"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
              >
                <Save className="w-5 h-5 mr-2" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;