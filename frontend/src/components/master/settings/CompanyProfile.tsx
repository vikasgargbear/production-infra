import React, { useState, useRef, useEffect } from 'react';
import {
    Building, Mail, Phone,
    MapPin, FileText, Printer,
    Globe, Image, Loader2,
    AlertCircle, RefreshCw
} from 'lucide-react';
import { companyApi } from '../../../services/api';
import { normalizeCompanyProfile, unwrapCompanyProfileResponse } from '../../../utils/companyProfile';
import BankAccountManager from '../masters/BankAccountManager';

interface CompanyProfileProps {
    open: boolean;
    onClose?: () => void;
}

interface CompanyData {
    // Basic Details
    businessName: string;
    tagline: string;
    logo: string | null;

    // Registration Details
    pan_number: string;
    gst_number: string;
    drugLicenseNo: string;
    fssaiNo: string;
    msmeNo: string;

    // Contact Details
    address: string;
    city: string;
    state: string;
    stateCode: string;
    pincode: string;
    country: string;
    phone: string;
    altPhone: string;
    email: string;
    website: string;

    // Financial Settings
    financialYearStart: string;
    financialYearEnd: string;
    defaultCurrency: string;
    currencySymbol: string;

    // Bank Details
    bankName: string;
    accountNumber: string;
    accountName: string;
    accountType: string;
    ifscCode: string;
    branchName: string;

    // Invoice Settings
    invoicePrefix: string;
    challanPrefix: string;
    poPrefix: string;
    returnPrefix: string;
    creditNotePrefix: string;
    debitNotePrefix: string;

    // Receipt Settings
    defaultTerms: string;
    defaultFooter: string;
    printFormat: string;
    showSignature: boolean;
    showLogo: boolean;
    showBankDetails: boolean;

    // Regional Settings
    timezone: string;
    dateFormat: string;
    timeFormat: string;
}

const CompanyProfile: React.FC<CompanyProfileProps> = ({ open, onClose }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const [companyData, setCompanyData] = useState<CompanyData>({
        // Basic Details
        businessName: '',
        tagline: '',
        logo: null,

        // Registration Details
        pan_number: '',
        gst_number: '',
        drugLicenseNo: '',
        fssaiNo: '',
        msmeNo: '',

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
        showBankDetails: true,

        // Regional Settings (NEW - for timezone handling)
        timezone: 'Asia/Kolkata',
        dateFormat: 'DD-MM-YYYY',
        timeFormat: '12h'
    });

    // Fetch organization profile on mount
    useEffect(() => {
        if (open) {
            fetchOrganizationProfile();
        }
    }, [open]);

    const fetchOrganizationProfile = async () => {
        setError(null);
        setIsLoading(true);
        try {
            const response = await companyApi.getCompanyInfo();

            if (response) {
                const data = unwrapCompanyProfileResponse(response);
                if (!data) throw new Error('Organization profile response is empty');
                const normalized = normalizeCompanyProfile(data);

                if (!normalized) {
                    throw new Error('Canonical organization profile has no legal name');
                }
                const primaryBank = normalized.bankAccounts[0];

                // Map the canonical organization projection through the same boundary
                // used by invoice documents and the global company context.
                setCompanyData({
                    // Basic Details
                    businessName: normalized.name,
                    tagline: normalized.business_settings?.tagline || '',
                    logo: normalized.logo,

                    // Registration Details
                    pan_number: normalized.pan_number,
                    gst_number: normalized.gst_number,
                    drugLicenseNo: normalized.drug_license_number,
                    fssaiNo: normalized.fssai_number,
                    msmeNo: normalized.msme_number,

                    // Contact Details
                    address: normalized.address,
                    city: normalized.city,
                    state: normalized.state,
                    stateCode: data.state_code || data.registered_state_code || normalized.state,
                    pincode: normalized.pincode,
                    country: data.country || 'India',
                    phone: normalized.phone,
                    altPhone: data.alt_phone || '',
                    email: normalized.email,
                    website: data.website || '',

                    // Financial Settings
                    financialYearStart: data.financial_year_start || '2024-04-01',
                    financialYearEnd: data.financial_year_end || '2025-03-31',
                    defaultCurrency: data.currency || 'INR',
                    currencySymbol: data.currency_symbol || '₹',

                    // Bank Details
                    bankName: primaryBank?.bank_name || '',
                    accountNumber: primaryBank?.account_number || '',
                    accountName: primaryBank?.account_name || '',
                    accountType: primaryBank?.account_type || 'CURRENT',
                    ifscCode: primaryBank?.ifsc_code || '',
                    branchName: primaryBank?.branch_name || '',

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
                    showBankDetails: data.business_settings?.show_bank_details !== false,

                    // Regional Settings (NEW)
                    timezone: data.timezone || data.business_settings?.timezone || 'Asia/Kolkata',
                    dateFormat: data.date_format || data.business_settings?.date_format || 'DD-MM-YYYY',
                    timeFormat: data.time_format || data.business_settings?.time_format || '12h'
                });

                // Update logo if it came from API
                if (normalized.logo) {
                    setLogoPreview(normalized.logo);
                }
            } else {
                setError('No organization data available');
            }
        } catch (error) {
            setError('Failed to load organization profile from the server.');
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

    const handleInputChange = (field: keyof CompanyData, value: any) => {
        setCompanyData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Check file size (max 2MB)
            if (file.size > 2 * 1024 * 1024) {
                setError('Logo size should be less than 2MB');
                setTimeout(() => setError(null), 5000);
                return;
            }

            // Preview only. Persistence requires a confirmed canonical API response.
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64Logo = reader.result as string;
                setLogoPreview(base64Logo);
                setCompanyData(prev => ({
                    ...prev,
                    logo: base64Logo
                }));
            };
            reader.readAsDataURL(file);
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
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-gray-50">
            {/* Header */}
            <div className="flex-shrink-0 border-b border-gray-200 bg-white px-3 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center space-x-3">
                        <Building className="w-6 h-6 text-gray-700" />
                        <h1 className="text-2xl font-bold text-gray-900">Company Profile</h1>
                    </div>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="flex min-h-11 items-center space-x-2 rounded-lg border border-gray-300 px-3 py-2 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                        </button>
                        <span className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-600">
                            Canonical profile · read only
                        </span>
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

            {error && (
                <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center">
                    <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
                    <p className="text-red-800">{error}</p>
                </div>
            )}

            {/* Content */}
            <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
                <fieldset disabled className="mx-auto max-w-6xl min-w-0 space-y-6 p-3 disabled:opacity-100 sm:p-6">
                    <div className="rounded-md border border-amber-200 bg-white px-4 py-3 text-sm text-amber-800">
                        Profile changes are disabled until the canonical cloud update workflow is available.
                    </div>

                    {/* Business Identity */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <Building className="w-5 h-5 mr-2" />
                            Business Identity
                        </h2>

                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
                            {/* Logo Upload */}
                            <div className="sm:col-span-1">
                                <label htmlFor="company-logo" className="block text-sm font-medium text-gray-700 mb-2">
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
                                        id="company-logo"
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleLogoUpload}
                                        className="hidden"
                                    />
                                </div>
                            </div>

                            {/* Business Name & Tagline */}
                            <div className="space-y-4 sm:col-span-2">
                                <div>
                                    <label htmlFor="company-business-name" className="block text-sm font-medium text-gray-700 mb-1">
                                        Business Name
                                    </label>
                                    <input
                                        id="company-business-name"
                                        type="text"
                                        value={companyData.businessName}
                                        onChange={(e) => handleInputChange('businessName', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="Enter your business name"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="company-tagline" className="block text-sm font-medium text-gray-700 mb-1">
                                        Tagline
                                    </label>
                                    <input
                                        id="company-tagline"
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
                    <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <FileText className="w-5 h-5 mr-2" />
                            Registration Details
                        </h2>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor="company-pan" className="block text-sm font-medium text-gray-700 mb-1">
                                    PAN Number
                                </label>
                                <input
                                    id="company-pan"
                                    type="text"
                                    value={companyData.pan_number}
                                    onChange={(e) => handleInputChange('pan_number', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="AABCP1234C"
                                />
                            </div>

                            <div>
                                <label htmlFor="company-gstin" className="block text-sm font-medium text-gray-700 mb-1">
                                    GSTIN
                                </label>
                                <input
                                    id="company-gstin"
                                    type="text"
                                    value={companyData.gst_number}
                                    onChange={(e) => handleInputChange('gst_number', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="29AABCP1234C1Z1"
                                />
                            </div>

                            <div>
                                <label htmlFor="company-drug-license" className="block text-sm font-medium text-gray-700 mb-1">
                                    Drug License No.
                                </label>
                                <input
                                    id="company-drug-license"
                                    type="text"
                                    value={companyData.drugLicenseNo}
                                    onChange={(e) => handleInputChange('drugLicenseNo', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="KA-B-123456"
                                />
                            </div>

                            <div>
                                <label htmlFor="company-fssai" className="block text-sm font-medium text-gray-700 mb-1">
                                    FSSAI No.
                                </label>
                                <input
                                    id="company-fssai"
                                    type="text"
                                    value={companyData.fssaiNo}
                                    onChange={(e) => handleInputChange('fssaiNo', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="10023456789012"
                                />
                            </div>

                            <div>
                                <label htmlFor="company-msme" className="block text-sm font-medium text-gray-700 mb-1">
                                    MSME/Udyam No.
                                </label>
                                <input
                                    id="company-msme"
                                    type="text"
                                    value={companyData.msmeNo}
                                    onChange={(e) => handleInputChange('msmeNo', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="UDYAM-XX-00-0000000"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Contact Details */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <MapPin className="w-5 h-5 mr-2" />
                            Contact Details
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="company-address" className="block text-sm font-medium text-gray-700 mb-1">
                                    Address
                                </label>
                                <input
                                    id="company-address"
                                    type="text"
                                    value={companyData.address}
                                    onChange={(e) => handleInputChange('address', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Street address"
                                />
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                <div>
                                    <label htmlFor="company-city" className="block text-sm font-medium text-gray-700 mb-1">
                                        City
                                    </label>
                                    <input
                                        id="company-city"
                                        type="text"
                                        value={companyData.city}
                                        onChange={(e) => handleInputChange('city', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="company-state" className="block text-sm font-medium text-gray-700 mb-1">
                                        State
                                    </label>
                                    <input
                                        id="company-state"
                                        type="text"
                                        value={companyData.state}
                                        onChange={(e) => handleInputChange('state', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="company-state-code" className="block text-sm font-medium text-gray-700 mb-1">
                                        State Code
                                    </label>
                                    <input
                                        id="company-state-code"
                                        type="text"
                                        value={companyData.stateCode}
                                        onChange={(e) => handleInputChange('stateCode', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                        placeholder="29"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="company-pincode" className="block text-sm font-medium text-gray-700 mb-1">
                                        Pincode
                                    </label>
                                    <input
                                        id="company-pincode"
                                        type="text"
                                        value={companyData.pincode}
                                        onChange={(e) => handleInputChange('pincode', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label htmlFor="company-phone" className="block text-sm font-medium text-gray-700 mb-1">
                                        <Phone className="w-4 h-4 inline mr-1" />
                                        Primary Phone
                                    </label>
                                    <input
                                        id="company-phone"
                                        type="tel"
                                        value={companyData.phone}
                                        onChange={(e) => handleInputChange('phone', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="company-alt-phone" className="block text-sm font-medium text-gray-700 mb-1">
                                        <Phone className="w-4 h-4 inline mr-1" />
                                        Alternate Phone
                                    </label>
                                    <input
                                        id="company-alt-phone"
                                        type="tel"
                                        value={companyData.altPhone}
                                        onChange={(e) => handleInputChange('altPhone', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="company-email" className="block text-sm font-medium text-gray-700 mb-1">
                                        <Mail className="w-4 h-4 inline mr-1" />
                                        Email
                                    </label>
                                    <input
                                        id="company-email"
                                        type="email"
                                        value={companyData.email}
                                        onChange={(e) => handleInputChange('email', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="company-website" className="block text-sm font-medium text-gray-700 mb-1">
                                        <Globe className="w-4 h-4 inline mr-1" />
                                        Website
                                    </label>
                                    <input
                                        id="company-website"
                                        type="url"
                                        value={companyData.website}
                                        onChange={(e) => handleInputChange('website', e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Regional Settings - NEW */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <Globe className="w-5 h-5 mr-2" />
                            Regional Settings
                        </h2>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            {/* Timezone */}
                            <div>
                                <label htmlFor="company-timezone" className="block text-sm font-medium text-gray-700 mb-1">
                                    Business Timezone
                                </label>
                                <select
                                    id="company-timezone"
                                    value={companyData.timezone}
                                    onChange={(e) => handleInputChange('timezone', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="Asia/Kolkata">India (IST - UTC+5:30)</option>
                                    <option value="Asia/Dubai">UAE (GST - UTC+4)</option>
                                    <option value="Asia/Singapore">Singapore (SGT - UTC+8)</option>
                                    <option value="Europe/London">UK (GMT/BST)</option>
                                    <option value="America/New_York">US Eastern (EST/EDT)</option>
                                </select>
                                <small className="text-xs text-gray-500 mt-1 block">
                                    All invoices and reports will use this timezone. Should match your GST registration location.
                                </small>
                            </div>

                            {/* Date Format */}
                            <div>
                                <label htmlFor="company-date-format" className="block text-sm font-medium text-gray-700 mb-1">
                                    Date Format
                                </label>
                                <select
                                    id="company-date-format"
                                    value={companyData.dateFormat}
                                    onChange={(e) => handleInputChange('dateFormat', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="DD-MM-YYYY">31-12-2024 (Indian)</option>
                                    <option value="MM-DD-YYYY">12-31-2024 (US)</option>
                                    <option value="YYYY-MM-DD">2024-12-31 (ISO)</option>
                                </select>
                                <small className="text-xs text-gray-500 mt-1 block">
                                    How dates are displayed in the app
                                </small>
                            </div>

                            {/* Time Format */}
                            <div>
                                <label htmlFor="company-time-format" className="block text-sm font-medium text-gray-700 mb-1">
                                    Time Format
                                </label>
                                <select
                                    id="company-time-format"
                                    value={companyData.timeFormat}
                                    onChange={(e) => handleInputChange('timeFormat', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="12h">12 Hour (3:30 PM)</option>
                                    <option value="24h">24 Hour (15:30)</option>
                                </select>
                                <small className="text-xs text-gray-500 mt-1 block">
                                    Time display format
                                </small>
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
                        onUpdate={(accountData: any) => {
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
                    <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <Printer className="w-5 h-5 mr-2" />
                            Document Prefixes
                        </h2>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <div>
                                <label htmlFor="company-invoice-prefix" className="block text-sm font-medium text-gray-700 mb-1">
                                    Invoice Prefix
                                </label>
                                <input
                                    id="company-invoice-prefix"
                                    type="text"
                                    value={companyData.invoicePrefix}
                                    onChange={(e) => handleInputChange('invoicePrefix', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label htmlFor="company-challan-prefix" className="block text-sm font-medium text-gray-700 mb-1">
                                    Challan Prefix
                                </label>
                                <input
                                    id="company-challan-prefix"
                                    type="text"
                                    value={companyData.challanPrefix}
                                    onChange={(e) => handleInputChange('challanPrefix', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label htmlFor="company-po-prefix" className="block text-sm font-medium text-gray-700 mb-1">
                                    PO Prefix
                                </label>
                                <input
                                    id="company-po-prefix"
                                    type="text"
                                    value={companyData.poPrefix}
                                    onChange={(e) => handleInputChange('poPrefix', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label htmlFor="company-return-prefix" className="block text-sm font-medium text-gray-700 mb-1">
                                    Return Prefix
                                </label>
                                <input
                                    id="company-return-prefix"
                                    type="text"
                                    value={companyData.returnPrefix}
                                    onChange={(e) => handleInputChange('returnPrefix', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label htmlFor="company-credit-prefix" className="block text-sm font-medium text-gray-700 mb-1">
                                    Credit Note Prefix
                                </label>
                                <input
                                    id="company-credit-prefix"
                                    type="text"
                                    value={companyData.creditNotePrefix}
                                    onChange={(e) => handleInputChange('creditNotePrefix', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label htmlFor="company-debit-prefix" className="block text-sm font-medium text-gray-700 mb-1">
                                    Debit Note Prefix
                                </label>
                                <input
                                    id="company-debit-prefix"
                                    type="text"
                                    value={companyData.debitNotePrefix}
                                    onChange={(e) => handleInputChange('debitNotePrefix', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Print Settings */}
                    <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                            <Printer className="w-5 h-5 mr-2" />
                            Print Settings
                        </h2>

                        <div className="space-y-4">
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                <div>
                                    <label htmlFor="company-print-format" className="block text-sm font-medium text-gray-700 mb-1">
                                        Print Format
                                    </label>
                                    <select
                                        id="company-print-format"
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

                                <div className="space-y-3 md:col-span-2">
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
                                <label htmlFor="company-default-terms" className="block text-sm font-medium text-gray-700 mb-1">
                                    Default Terms & Conditions
                                </label>
                                <textarea
                                    id="company-default-terms"
                                    value={companyData.defaultTerms}
                                    onChange={(e) => handleInputChange('defaultTerms', e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Enter your default terms and conditions"
                                />
                            </div>

                            <div>
                                <label htmlFor="company-default-footer" className="block text-sm font-medium text-gray-700 mb-1">
                                    Default Footer Text
                                </label>
                                <input
                                    id="company-default-footer"
                                    type="text"
                                    value={companyData.defaultFooter}
                                    onChange={(e) => handleInputChange('defaultFooter', e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder="Thank you for your business!"
                                />
                            </div>
                        </div>
                    </div>

                </fieldset>
            </div>
        </div>
    );
};

export default CompanyProfile;
