import React, { useState, useEffect } from 'react';
import { X, Save, Upload, Building2, QrCode } from 'lucide-react';
import { useToast } from './global/ui/feedback/Toast';
import { organizationsApi, companyAPI } from '../services/api';
import { useCompany } from '../contexts/CompanyContext';

const CompanySettings = ({ open = true, onClose }) => {
  const toast = useToast();
  const { companyInfo, updateCompanyInfo, getOrgId } = useCompany();
  const [isLoading, setIsLoading] = useState(false);
  const [settings, setSettings] = useState({
    companyName: companyInfo.name || '',
    companyAddress: companyInfo.address || '',
    companyGST: companyInfo.gst || companyInfo.gst_number || '',
    companyDL: companyInfo.drugLicense || companyInfo.drug_license || '',
    companyState: companyInfo.state || '',
    companyLogo: companyInfo.logo || '',
    bankName: companyInfo.bank_name || '',
    accountNumber: companyInfo.account_number || '',
    ifscCode: companyInfo.ifsc_code || '',
    digitalSignature: companyInfo.logo || '',
    businessType: companyInfo.business_settings?.business_type || 'b2b',
    paymentQR: companyInfo.paymentQR || '',
    showTransportDetails: companyInfo.business_settings?.show_transport_details !== false // Default to true
  });

  const [logoPreview, setLogoPreview] = useState(settings.companyLogo);
  const [signaturePreview, setSignaturePreview] = useState(settings.digitalSignature);
  const [qrPreview, setQrPreview] = useState(settings.paymentQR);

  useEffect(() => {
    if (open) {
      setSettings({
        companyName: companyInfo.name || '',
        companyAddress: companyInfo.address || '',
        companyGST: companyInfo.gst || companyInfo.gst_number || '',
        companyDL: companyInfo.drugLicense || companyInfo.drug_license || '',
        companyState: companyInfo.state || '',
        companyLogo: companyInfo.logo || '',
        bankName: companyInfo.bank_name || '',
        accountNumber: companyInfo.account_number || '',
        ifscCode: companyInfo.ifsc_code || '',
        digitalSignature: companyInfo.logo || '',
        businessType: companyInfo.business_settings?.business_type || 'b2b',
        showTransportDetails: companyInfo.business_settings?.show_transport_details !== false, // Default to true
        paymentQR: companyInfo.paymentQR || ''
      });
      setLogoPreview(companyInfo.logo || '');
      setSignaturePreview(companyInfo.logo || '');
      setQrPreview(companyInfo.paymentQR || '');
    }
  }, [open, companyInfo]);

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

  const handleQRUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setQrPreview(reader.result);
        setSettings({ ...settings, paymentQR: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);

    try {
      const companyData = {
        name: settings.companyName,
        address: settings.companyAddress,
        phone: companyInfo.phone || '',
        email: companyInfo.email || '',
        gst: settings.companyGST,
        state: settings.companyState,
        logo: settings.companyLogo,
        drugLicense: settings.companyDL,
        bank_name: settings.bankName,
        account_number: settings.accountNumber,
        ifsc_code: settings.ifscCode,
        upi_id: companyInfo.upi_id || '',
        business_settings: {
          ...(companyInfo.business_settings || {}),
          business_type: settings.businessType,
          show_transport_details: settings.showTransportDetails
        }
      };

      await updateCompanyInfo(companyData);
      
      // Upload QR code if changed
      if (settings.paymentQR && settings.paymentQR !== companyInfo.paymentQR) {
        await companyAPI.uploadQRCode(settings.paymentQR);
      }
      
      toast.saved('Company Settings');
    } catch (error) {
      toast.error('Failed to save settings. Please try again later.');
    } finally {
      setIsLoading(false);
    }
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

          {/* Business Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Type
            </label>
            <select
              value={settings.businessType}
              onChange={(e) => setSettings({ ...settings, businessType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="b2b">B2B (Wholesale/Distribution)</option>
              <option value="b2c">B2C (Retail/Individual Sales)</option>
              <option value="retail">Retail Store</option>
              <option value="pharmacy">Pharmacy</option>
              <option value="wholesale">Wholesale</option>
              <option value="distributor">Distributor</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              This controls the customer creation form type. B2B shows business fields (GST, credit terms), B2C shows simplified individual customer fields.
            </p>
          </div>

          {/* Transport Details Toggle */}
          <div>
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showTransportDetails}
                onChange={(e) => setSettings({ ...settings, showTransportDetails: e.target.checked })}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
              />
              <div>
                <span className="text-sm font-medium text-gray-700">Show Transport Details on Invoice</span>
                <p className="text-xs text-gray-500">
                  When enabled, transport company, vehicle number, and delivery details will be displayed on invoices.
                </p>
              </div>
            </label>
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

          {/* Payment QR Code Section */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
              <QrCode className="w-5 h-5 mr-2" />
              Payment QR Code
            </h3>
            
            <div className="flex items-center space-x-4">
              {qrPreview ? (
                <img 
                  src={qrPreview} 
                  alt="Payment QR Code" 
                  className="h-32 w-32 object-contain border border-gray-300 rounded-lg p-2"
                />
              ) : (
                <div className="h-32 w-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center">
                  <QrCode className="w-12 h-12 text-gray-400" />
                </div>
              )}
              <div>
                <input
                  type="file"
                  id="qr-upload"
                  accept="image/*"
                  onChange={handleQRUpload}
                  className="hidden"
                />
                <label
                  htmlFor="qr-upload"
                  className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload QR Code
                </label>
                <p className="text-xs text-gray-500 mt-2">
                  Upload your UPI/Payment QR code to display on invoices
                </p>
              </div>
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
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onloadend = () => {
                        // TODO: Handle signature upload
                        // setSignatureUpload(reader.result);
                        
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  className="hidden"
                />
                <label
                  htmlFor="signature-upload"
                  className="cursor-pointer px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  Upload Signature
                </label>
              </div>
            </div>
          </div>

          {/* Footer with Save Button */}
          <div className="border-t border-gray-200 px-6 py-4 bg-gray-50 flex justify-end space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompanySettings;
