import React, { useState, useRef, useEffect } from 'react';
import { 
  Building, Upload, Save, Mail, Phone, 
  MapPin, FileText, Calendar, Printer,
  CreditCard, Globe, Image, Loader2,
  AlertCircle
} from 'lucide-react';
import { organizationsApi } from '../../services/api';

const CompanyProfile = ({ open, onClose }) => {
  const fileInputRef = useRef(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  
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
    fetchOrganizationProfile();
  }, []);

  const getMockCompanyData = () => ({
    // Basic Details
    businessName: 'PharmaERP Demo Company',
    tagline: 'Your trusted pharmaceutical partner',
    logo: null,
    
    // Registration Details
    pan: 'ABCDE1234F',
    gstin: '27ABCDE1234F1Z5',
    drugLicenseNo: 'DL-MH-001-2024',
    fssaiNo: '12345678901234',
    
    // Contact Details
    address: '123 Business District, Pharmaceutical Park',
    city: 'Mumbai',
    state: 'Maharashtra',
    stateCode: '27',
    pincode: '400001',
    country: 'India',
    phone: '+91 98765 43210',
    altPhone: '+91 98765 43211',
    email: 'info@pharmaerp.com',
    website: 'www.pharmaerp.com',
    
    // Financial Settings
    bankName: 'State Bank of India',
    accountNumber: '1234567890',
    ifscCode: 'SBIN0001234',
    branchName: 'Mumbai Main Branch',
    
    // Invoice Settings
    invoicePrefix: 'INV/',
    challanPrefix: 'DC/',
    poPrefix: 'PO/',
    returnPrefix: 'RTN/',
    creditNotePrefix: 'CN/',
    debitNotePrefix: 'DN/',
    
    // Receipt Settings
    defaultTerms: 'Payment due within 30 days',
    defaultFooter: 'Thank you for your business!',
    printFormat: 'A4',
    showSignature: true,
    showLogo: true,
  });

  const fetchOrganizationProfile = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Try different API endpoints for organization profile
      let response;
      try {
        // Try organizations API first
        if (organizationsApi?.organizations?.getProfile) {
          response = await organizationsApi.organizations.getProfile();
        } else if (organizationsApi?.getProfile) {
          response = await organizationsApi.getProfile();
        } else {
          throw new Error('Organization API not available');
        }
      } catch (apiError) {
        console.log('Organization API not available, using mock data');
        response = null;
      }
      
      console.log('Organization API Response:', response);
      
      // Handle different response formats
      const data = response?.data || response;
      
      if (data) {
        
        // Map API response to component state
        setCompanyData({
          // Basic Details
          businessName: data.org_name || '',
          tagline: data.business_settings?.tagline || '',
          logo: data.business_settings?.logo_url || null,
          
          // Registration Details
          pan: data.pan_number || '',
          gstin: data.gst_number || '',
          drugLicenseNo: data.drug_license_number || '',
          fssaiNo: data.business_settings?.fssai_number || '',
          
          // Contact Details
          address: data.business_address?.line1 || '',
          city: data.business_address?.city || '',
          state: data.business_address?.state || '',
          stateCode: data.business_address?.state_code || '',
          pincode: data.business_address?.pincode || '',
          country: data.business_address?.country || 'India',
          phone: data.primary_phone || '',
          altPhone: data.business_settings?.alternate_phone || '',
          email: data.primary_email || '',
          website: data.business_settings?.website || '',
          
          // Financial Settings
          financialYearStart: data.business_settings?.financial_year_start || '2024-04-01',
          financialYearEnd: data.business_settings?.financial_year_end || '2025-03-31',
          defaultCurrency: data.business_settings?.currency || 'INR',
          currencySymbol: data.business_settings?.currency_symbol || '₹',
          
          // Bank Details
          bankName: data.business_settings?.bank_name || '',
          accountNumber: data.business_settings?.account_number || '',
          ifscCode: data.business_settings?.ifsc_code || '',
          branchName: data.business_settings?.branch_name || '',
          
          // Invoice Settings
          invoicePrefix: data.business_settings?.invoice_prefix || 'INV/',
          challanPrefix: data.business_settings?.challan_prefix || 'DC/',
          poPrefix: data.business_settings?.po_prefix || 'PO/',
          returnPrefix: data.business_settings?.return_prefix || 'RTN/',
          creditNotePrefix: data.business_settings?.credit_note_prefix || 'CN/',
          debitNotePrefix: data.business_settings?.debit_note_prefix || 'DN/',
          
          // Receipt Settings
          defaultTerms: data.business_settings?.default_terms || '',
          defaultFooter: data.business_settings?.default_footer || '',
          printFormat: data.business_settings?.print_format || 'A4',
          showSignature: data.business_settings?.show_signature !== false,
          showLogo: data.business_settings?.show_logo !== false,
          showBankDetails: data.business_settings?.show_bank_details !== false
        });
        
        if (data.business_settings?.logo_url) {
          setLogoPreview(data.business_settings.logo_url);
        }
      } else {
        // Use mock data if no API response
        setCompanyData(getMockCompanyData());
      }
    } catch (error) {
      console.error('Error fetching organization profile:', error);
      setError('Failed to load organization profile. Using offline data.');
      // Use mock data as fallback
      setCompanyData(getMockCompanyData());
    } finally {
      setIsLoading(false);
    }
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
      // Show preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
      };
      reader.readAsDataURL(file);
      
      // Upload to backend
      try {
        const response = await organizationsApi.uploadLogo(file);
        if (response.success) {
          setSuccessMessage('Logo uploaded successfully!');
          setTimeout(() => setSuccessMessage(''), 3000);
        }
      } catch (error) {
        console.error('Error uploading logo:', error);
        setError('Failed to upload logo. Please try again.');
      }
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessMessage('');
    
    try {
      // Prepare data for API
      const profileData = {
        org_name: companyData.businessName,
        company_registration_number: companyData.pan,
        pan_number: companyData.pan,
        gst_number: companyData.gstin,
        drug_license_number: companyData.drugLicenseNo,
        primary_contact_name: companyData.businessName,
        primary_email: companyData.email,
        primary_phone: companyData.phone,
        business_address: {
          line1: companyData.address,
          city: companyData.city,
          state: companyData.state,
          state_code: companyData.stateCode,
          pincode: companyData.pincode,
          country: companyData.country
        },
        business_settings: {
          tagline: companyData.tagline,
          fssai_number: companyData.fssaiNo,
          alternate_phone: companyData.altPhone,
          website: companyData.website,
          financial_year_start: companyData.financialYearStart,
          financial_year_end: companyData.financialYearEnd,
          currency: companyData.defaultCurrency,
          currency_symbol: companyData.currencySymbol,
          bank_name: companyData.bankName,
          account_number: companyData.accountNumber,
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
        }
      };
      
      const response = await organizationsApi.updateProfile(profileData);
      
      if (response.success) {
        setSuccessMessage('Company profile saved successfully!');
        setTimeout(() => {
          setSuccessMessage('');
        }, 3000);
      }
    } catch (error) {
      console.error('Error saving company profile:', error);
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
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Building className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Company Profile</h1>
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50"
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
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          
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

          {/* Bank Details */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
              <CreditCard className="w-5 h-5 mr-2" />
              Bank Details
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={companyData.bankName}
                  onChange={(e) => handleInputChange('bankName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Account Number
                </label>
                <input
                  type="text"
                  value={companyData.accountNumber}
                  onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  IFSC Code
                </label>
                <input
                  type="text"
                  value={companyData.ifscCode}
                  onChange={(e) => handleInputChange('ifscCode', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Branch Name
                </label>
                <input
                  type="text"
                  value={companyData.branchName}
                  onChange={(e) => handleInputChange('branchName', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

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