import React, { useState, useRef, useEffect } from 'react';
import { 
  Building, Upload, Save, Mail, Phone, 
  MapPin, FileText, Calendar, Printer,
  Globe, Image, Loader2,
  AlertCircle, RefreshCw
} from 'lucide-react';
import { companyAPI, bankAccountsAPI } from '../../services/api';
import BankAccountManager from './BankAccountManager';

const CompanyProfile = ({ open, onClose }) => {
  const fileInputRef = useRef(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  
  const [companyData, setCompanyData] = useState({
    // Basic Details
    businessName: '',
    tagline: '',
    logo: null,
    
    // Registration Details
    pan: '',
    gstin: '',
    drugLicenseNo: '',
    fssaiNo: '',
    
    // Contact Details
    address: '',
    city: '',
    state: '',
    stateCode: '',
    pincode: '',
    country: 'India',
    phone: '',
    altPhone: '',
    email: '',
    website: '',
    
    // Financial Settings
    financialYearStart: '2024-04-01',
    financialYearEnd: '2025-03-31',
    defaultCurrency: 'INR',
    currencySymbol: '₹',
    
    // Bank Details
    bankName: '',
    accountNumber: '',
    accountName: '',
    accountType: 'CURRENT',
    ifscCode: '',
    branchName: '',
    
    // Invoice Settings
    invoicePrefix: 'INV/',
    challanPrefix: 'DC/',
    poPrefix: 'PO/',
    returnPrefix: 'RTN/',
    creditNotePrefix: 'CN/',
    debitNotePrefix: 'DN/',
    
    // Receipt Settings
    defaultTerms: '',
    defaultFooter: '',
    printFormat: 'A4',
    showSignature: true,
    showLogo: true,
    showBankDetails: true
  });

  // Fetch organization profile on mount
  useEffect(() => {
    if (open) {
      fetchOrganizationProfile();
      
      // Load logo from localStorage
      const savedLogo = localStorage.getItem('companyLogo');
      if (savedLogo) {
        setLogoPreview(savedLogo);
        setCompanyData(prev => ({
          ...prev,
          logo: savedLogo
        }));
      }
    }
  }, [open]);

  const fetchOrganizationProfile = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await companyAPI.getCompanyInfo();
      
      if (response) {
        const data = response;
        
        // Map API response to component state (matching backend company.py response)
        setCompanyData({
          // Basic Details
          businessName: data.name || '',
          tagline: data.tagline || '',
          logo: data.logo || null,
          
          // Registration Details
          pan: data.pan || '',
          gstin: data.gst || '',
          drugLicenseNo: data.drug_license_no || '',
          fssaiNo: data.fssai_no || '',
          
          // Contact Details
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          stateCode: data.state_code || '',
          pincode: data.pincode || '',
          country: data.country || 'India',
          phone: data.phone || '',
          altPhone: data.alt_phone || '',
          email: data.email || '',
          website: data.website || '',
          
          // Financial Settings
          financialYearStart: data.financial_year_start || '2024-04-01',
          financialYearEnd: data.financial_year_end || '2025-03-31',
          defaultCurrency: data.currency || 'INR',
          currencySymbol: data.currency_symbol || '₹',
          
          // Bank Details
          bankName: data.bank_name || '',
          accountNumber: data.account_number || '',
          accountName: data.account_name || '',
          accountType: data.account_type || 'CURRENT',
          ifscCode: data.ifsc_code || '',
          branchName: data.branch_name || '',
          
          // Invoice Settings
          invoicePrefix: data.business_settings?.invoice_prefix || data.invoice_prefix || 'INV/',
          challanPrefix: data.business_settings?.challan_prefix || data.challan_prefix || 'DC/',
          poPrefix: data.business_settings?.po_prefix || data.po_prefix || 'PO/',
          returnPrefix: data.business_settings?.return_prefix || data.return_prefix || 'RTN/',
          creditNotePrefix: data.business_settings?.credit_note_prefix || data.credit_note_prefix || 'CN/',
          debitNotePrefix: data.business_settings?.debit_note_prefix || data.debit_note_prefix || 'DN/',
          
          // Receipt Settings
          defaultTerms: data.business_settings?.default_terms || data.default_terms || '',
          defaultFooter: data.business_settings?.default_footer || data.default_footer || '',
          printFormat: data.business_settings?.print_format || data.print_format || 'A4',
          showSignature: data.business_settings?.show_signature !== false,
          showLogo: data.business_settings?.show_logo !== false,
          showBankDetails: data.business_settings?.show_bank_details !== false
        });
      } else {
        setError('No organization data available');
      }
    } catch (error) {
      setError('Failed to load organization profile. Please check your connection and try again.');
      
      // Show user-friendly error message
      setTimeout(() => setError(null), 10000);
    } finally {
      setIsLoading(false);
    }
  };

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchOrganizationProfile();
    setRefreshing(false);
  };

  const handleInputChange = (field, value) => {
    setCompanyData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      // Check file size (max 2MB for localStorage)
      if (file.size > 2 * 1024 * 1024) {
        setError('Logo size should be less than 2MB');
        setTimeout(() => setError(null), 5000);
        return;
      }

      // Show preview and save to localStorage
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Logo = reader.result;
        setLogoPreview(base64Logo);
        
        // Save to localStorage for persistence
        localStorage.setItem('companyLogo', base64Logo);
        
        // Update company data
        setCompanyData(prev => ({
          ...prev,
          logo: base64Logo
        }));
        
        setSuccessMessage('Logo uploaded successfully!');
        setTimeout(() => setSuccessMessage(''), 3000);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage('');
    
    try {
      // Prepare data for API (matching backend company.py expected format)
      const profileData = {
        name: companyData.businessName,
        address: companyData.address,
        city: companyData.city,
        state: companyData.state,
        pincode: companyData.pincode,
        country: companyData.country,
        phone: companyData.phone,
        email: companyData.email,
        website: companyData.website,
        gst: companyData.gstin,
        pan: companyData.pan,
        logo: companyData.logo,
        // Additional fields can be stored here
        tagline: companyData.tagline,
        drug_license_no: companyData.drugLicenseNo,
        fssai_no: companyData.fssaiNo,
        state_code: companyData.stateCode,
        alt_phone: companyData.altPhone,
        financial_year_start: companyData.financialYearStart,
        financial_year_end: companyData.financialYearEnd,
        currency: companyData.defaultCurrency,
        currency_symbol: companyData.currencySymbol,
        bank_name: companyData.bankName,
        account_number: companyData.accountNumber,
        account_name: companyData.accountName,
        account_type: companyData.accountType,
        ifsc_code: companyData.ifscCode,
        branch_name: companyData.branchName,
        invoice_prefix: companyData.invoicePrefix,
        challan_prefix: companyData.challanPrefix,
        po_prefix: companyData.poPrefix,
        return_prefix: companyData.returnPrefix,
        credit_note_prefix: companyData.creditNotePrefix,
        debit_note_prefix: companyData.debitNotePrefix,
        default_terms: companyData.defaultTerms,
        default_footer: companyData.defaultFooter,
        print_format: companyData.printFormat,
        show_signature: companyData.showSignature,
        show_logo: companyData.showLogo,
        show_bank_details: companyData.showBankDetails
      };
      
      const response = await companyAPI.updateCompanyInfo(profileData);
      
      if (response) {
        setSuccessMessage('Company profile saved successfully!');
        setTimeout(() => {
          setSuccessMessage('');
        }, 3000);
      }
    } catch (error) {
      setError('Failed to save company profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading company profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Building className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Company Profile</h1>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-500"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="mx-6 mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          <span className="text-blue-800">Loading company profile...</span>
        </div>
      )}

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 text-green-600 mr-3" />
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}
      
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6 space-y-6">
          
          {/* Business Identity */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Building className="w-5 h-5 mr-2" />
              Business Identity
            </h2>
            
            <div className="grid grid-cols-3 gap-6">
              {/* Logo Upload */}
              <div className="col-span-1">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Logo
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                  {logoPreview ? (
                    <div className="relative">
                      <img 
                        src={logoPreview} 
                        alt="Company Logo" 
                        className="max-h-32 mx-auto rounded"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                      >
                        Change Logo
                      </button>
                    </div>
                  ) : (
                    <div>
                      <Image className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Upload Logo
                      </button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </div>
              </div>
              
              {/* Business Name & Tagline */}
              <div className="col-span-2 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={companyData.businessName}
                    onChange={(e) => handleInputChange('businessName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter your business name"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tagline
                  </label>
                  <input
                    type="text"
                    value={companyData.tagline}
                    onChange={(e) => handleInputChange('tagline', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Your business tagline"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Registration Details */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Registration Details
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PAN Number
                </label>
                <input
                  type="text"
                  value={companyData.pan}
                  onChange={(e) => handleInputChange('pan', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="AABCP1234C"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GSTIN
                </label>
                <input
                  type="text"
                  value={companyData.gstin}
                  onChange={(e) => handleInputChange('gstin', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="29AABCP1234C1Z1"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Drug License No.
                </label>
                <input
                  type="text"
                  value={companyData.drugLicenseNo}
                  onChange={(e) => handleInputChange('drugLicenseNo', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="KA-B-123456"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  FSSAI No.
                </label>
                <input
                  type="text"
                  value={companyData.fssaiNo}
                  onChange={(e) => handleInputChange('fssaiNo', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="10023456789012"
                />
              </div>
            </div>
          </div>

          {/* Contact Details */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <MapPin className="w-5 h-5 mr-2" />
              Contact Details
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={companyData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Street address"
                />
              </div>
              
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={companyData.city}
                    onChange={(e) => handleInputChange('city', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State
                  </label>
                  <input
                    type="text"
                    value={companyData.state}
                    onChange={(e) => handleInputChange('state', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    State Code
                  </label>
                  <input
                    type="text"
                    value={companyData.stateCode}
                    onChange={(e) => handleInputChange('stateCode', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="29"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pincode
                  </label>
                  <input
                    type="text"
                    value={companyData.pincode}
                    onChange={(e) => handleInputChange('pincode', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Primary Phone
                  </label>
                  <input
                    type="tel"
                    value={companyData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Alternate Phone
                  </label>
                  <input
                    type="tel"
                    value={companyData.altPhone}
                    onChange={(e) => handleInputChange('altPhone', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Mail className="w-4 h-4 inline mr-1" />
                    Email
                  </label>
                  <input
                    type="email"
                    value={companyData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Globe className="w-4 h-4 inline mr-1" />
                    Website
                  </label>
                  <input
                    type="url"
                    value={companyData.website}
                    onChange={(e) => handleInputChange('website', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bank Account Management - Now using dedicated component */}
          <BankAccountManager 
            companyData={{
              businessName: companyData.businessName,
              // Pass existing bank data if migrating from old single-account system
              bankName: companyData.bankName,
              accountNumber: companyData.accountNumber,
              accountName: companyData.accountName,
              accountType: companyData.accountType,
              ifscCode: companyData.ifscCode,
              branchName: companyData.branchName
            }}
            onUpdate={(accountData) => {
              // When default account changes, update company data
              // This maintains backward compatibility
              if (accountData.is_default_account) {
                setCompanyData(prev => ({
                  ...prev,
                  bankName: accountData.bank_name,
                  accountNumber: accountData.account_number,
                  accountName: accountData.account_name,
                  accountType: accountData.account_type,
                  ifscCode: accountData.ifsc_code,
                  branchName: accountData.branch_name
                }));
              }
            }}
          />

          {/* Invoice Settings */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Printer className="w-5 h-5 mr-2" />
              Document Prefixes
            </h2>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Invoice Prefix
                </label>
                <input
                  type="text"
                  value={companyData.invoicePrefix}
                  onChange={(e) => handleInputChange('invoicePrefix', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Challan Prefix
                </label>
                <input
                  type="text"
                  value={companyData.challanPrefix}
                  onChange={(e) => handleInputChange('challanPrefix', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  PO Prefix
                </label>
                <input
                  type="text"
                  value={companyData.poPrefix}
                  onChange={(e) => handleInputChange('poPrefix', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Return Prefix
                </label>
                <input
                  type="text"
                  value={companyData.returnPrefix}
                  onChange={(e) => handleInputChange('returnPrefix', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Credit Note Prefix
                </label>
                <input
                  type="text"
                  value={companyData.creditNotePrefix}
                  onChange={(e) => handleInputChange('creditNotePrefix', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Debit Note Prefix
                </label>
                <input
                  type="text"
                  value={companyData.debitNotePrefix}
                  onChange={(e) => handleInputChange('debitNotePrefix', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Print Settings */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <Printer className="w-5 h-5 mr-2" />
              Print Settings
            </h2>
            
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Print Format
                  </label>
                  <select
                    value={companyData.printFormat}
                    onChange={(e) => handleInputChange('printFormat', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="A4">A4</option>
                    <option value="A5">A5</option>
                    <option value="Letter">Letter</option>
                    <option value="Thermal">Thermal (80mm)</option>
                  </select>
                </div>
                
                <div className="col-span-2 space-y-3">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={companyData.showLogo}
                      onChange={(e) => handleInputChange('showLogo', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Show logo on receipts</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={companyData.showSignature}
                      onChange={(e) => handleInputChange('showSignature', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Show signature line</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={companyData.showBankDetails}
                      onChange={(e) => handleInputChange('showBankDetails', e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span className="text-sm text-gray-700">Show bank details</span>
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Terms & Conditions
                </label>
                <textarea
                  value={companyData.defaultTerms}
                  onChange={(e) => handleInputChange('defaultTerms', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter your default terms and conditions"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Footer Text
                </label>
                <input
                  type="text"
                  value={companyData.defaultFooter}
                  onChange={(e) => handleInputChange('defaultFooter', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Thank you for your business!"
                />
              </div>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default CompanyProfile;