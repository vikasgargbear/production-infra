import React, { useState, useEffect } from 'react';
import { X, Save, Upload, Building2 } from 'lucide-react';

const CompanySettings = ({ open = true, onClose }) => {
  const [settings, setSettings] = useState({
    companyName: localStorage.getItem('companyName') || '',
    companyAddress: localStorage.getItem('companyAddress') || '',
    companyGST: localStorage.getItem('companyGST') || '',
    companyDL: localStorage.getItem('companyDL') || '',
    companyState: localStorage.getItem('companyState') || '',
    companyLogo: localStorage.getItem('companyLogo') || '',
    bankName: localStorage.getItem('bankName') || '',
    accountNumber: localStorage.getItem('accountNumber') || '',
    ifscCode: localStorage.getItem('ifscCode') || '',
    digitalSignature: localStorage.getItem('digitalSignature') || ''
  });

  const [logoPreview, setLogoPreview] = useState(settings.companyLogo);
  const [signaturePreview, setSignaturePreview] = useState(settings.digitalSignature);

  useEffect(() => {
    if (open) {
      setSettings({
        companyName: localStorage.getItem('companyName') || '',
        companyAddress: localStorage.getItem('companyAddress') || '',
        companyGST: localStorage.getItem('companyGST') || '',
        companyDL: localStorage.getItem('companyDL') || '',
        companyState: localStorage.getItem('companyState') || '',
        companyLogo: localStorage.getItem('companyLogo') || '',
        bankName: localStorage.getItem('bankName') || '',
        accountNumber: localStorage.getItem('accountNumber') || '',
        ifscCode: localStorage.getItem('ifscCode') || '',
        digitalSignature: localStorage.getItem('digitalSignature') || ''
      });
      setLogoPreview(localStorage.getItem('companyLogo') || '');
      setSignaturePreview(localStorage.getItem('digitalSignature') || '');
    }
  }, [open]);

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
        setSettings({ ...settings, companyLogo: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSignatureUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSignaturePreview(reader.result);
        setSettings({ ...settings, digitalSignature: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    Object.entries(settings).forEach(([key, value]) => {
      if (value) {
        localStorage.setItem(key, value);
      }
    });
    alert('Company settings saved successfully!');
    onClose();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="bg-white rounded-lg shadow-lg max-w-2xl mx-auto overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 flex items-center">
              <Building2 className="w-5 h-5 mr-2" />
              Company Settings
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Logo Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Company Logo
            </label>
            <div className="flex items-center space-x-4">
              {logoPreview ? (
                <img 
                  src={logoPreview} 
                  alt="Company Logo" 
                  className="h-24 w-auto object-contain border border-gray-300 rounded-lg p-2"
                />
              ) : (
                <div className="h-24 w-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                  <Upload className="w-8 h-8 text-gray-400" />
                </div>
              )}
              <div>
                <input
                  type="file"
                  id="logo-upload"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <label
                  htmlFor="logo-upload"
                  className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Logo
                </label>
                <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 2MB</p>
              </div>
            </div>
          </div>

          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name
            </label>
            <input
              type="text"
              value={settings.companyName}
              onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter company name"
            />
          </div>

          {/* Company Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Address
            </label>
            <textarea
              value={settings.companyAddress}
              onChange={(e) => setSettings({ ...settings, companyAddress: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows="2"
              placeholder="Enter company address"
            />
          </div>

          {/* GST Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              GSTIN
            </label>
            <input
              type="text"
              value={settings.companyGST}
              onChange={(e) => setSettings({ ...settings, companyGST: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., 27AAAAA0000A1Z5"
            />
          </div>

          {/* Drug License */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Drug License Number
            </label>
            <input
              type="text"
              value={settings.companyDL}
              onChange={(e) => setSettings({ ...settings, companyDL: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g., MH-MUM-123456"
            />
          </div>

          {/* State */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              State
            </label>
            <select
              value={settings.companyState}
              onChange={(e) => setSettings({ ...settings, companyState: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select State</option>
              <option value="Maharashtra">Maharashtra</option>
              <option value="Gujarat">Gujarat</option>
              <option value="Delhi">Delhi</option>
              <option value="Karnataka">Karnataka</option>
              <option value="Tamil Nadu">Tamil Nadu</option>
              <option value="West Bengal">West Bengal</option>
              <option value="Rajasthan">Rajasthan</option>
              <option value="Uttar Pradesh">Uttar Pradesh</option>
              <option value="Telangana">Telangana</option>
              <option value="Kerala">Kerala</option>
            </select>
          </div>

          {/* Bank Details Section */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Bank Details</h3>
            
            {/* Bank Name */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank Name
              </label>
              <input
                type="text"
                value={settings.bankName}
                onChange={(e) => setSettings({ ...settings, bankName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., State Bank of India"
              />
            </div>

            {/* Account Number */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Number
              </label>
              <input
                type="text"
                value={settings.accountNumber}
                onChange={(e) => setSettings({ ...settings, accountNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., 1234567890"
              />
            </div>

            {/* IFSC Code */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                IFSC Code
              </label>
              <input
                type="text"
                value={settings.ifscCode}
                onChange={(e) => setSettings({ ...settings, ifscCode: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., SBIN0001234"
              />
            </div>
          </div>

          {/* Digital Signature Section */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Digital Signature</h3>
            
            <div className="flex items-center space-x-4">
              {signaturePreview ? (
                <img 
                  src={signaturePreview} 
                  alt="Digital Signature" 
                  className="h-24 w-auto object-contain border border-gray-300 rounded-lg p-2"
                />
              ) : (
                <div className="h-24 w-48 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                  <span className="text-gray-400 text-sm">No signature uploaded</span>
                </div>
              )}
              <div>
                <input
                  type="file"
                  id="signature-upload"
                  accept="image/*"
                  onChange={handleSignatureUpload}
                  className="hidden"
                />
                <label
                  htmlFor="signature-upload"
                  className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Signature
                </label>
                <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 2MB</p>
                {signaturePreview && (
                  <button
                    onClick={() => {
                      setSignaturePreview('');
                      setSettings({ ...settings, digitalSignature: '' });
                    }}
                    className="text-xs text-red-600 hover:text-red-700 mt-1"
                  >
                    Remove signature
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-gray-50 px-6 py-3 border-t border-gray-200">
          <div className="flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
            >
              <Save className="w-4 h-4 mr-2" />
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanySettings;