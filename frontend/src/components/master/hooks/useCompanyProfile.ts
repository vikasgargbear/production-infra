/**
 * useCompanyProfile Hook
 * 
 * Extracts state management and form logic from CompanyProfile.tsx
 */

import { useState, useEffect, useCallback } from 'react';
import { settingsApi, metadataApi } from '../../../services/api';
import { toast } from 'react-toastify';

// ============================================
// Type Definitions
// ============================================

export interface CompanyProfileData {
    // Basic Info
    org_name: string;
    legal_name: string;
    business_type: string;
    establishment_date: string;

    // Registration
    gst_number: string;
    pan_number: string;
    cin_number: string;
    drug_license_number: string;
    fssai_number: string;

    // Contact
    email_addresses: string[];
    contact_numbers: string[];
    website: string;

    // Address
    registered_address: string;
    correspondence_address: string;
    city: string;
    state: string;
    pincode: string;
    country: string;

    // Bank Details
    bank_name: string;
    bank_account_number: string;
    bank_ifsc_code: string;
    bank_branch: string;
}

// ============================================
// Default Values
// ============================================

const getInitialData = (): CompanyProfileData => ({
    org_name: '',
    legal_name: '',
    business_type: 'Pharmacy',
    establishment_date: '',
    gst_number: '',
    pan_number: '',
    cin_number: '',
    drug_license_number: '',
    fssai_number: '',
    email_addresses: [''],
    contact_numbers: [''],
    website: '',
    registered_address: '',
    correspondence_address: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
    bank_name: '',
    bank_account_number: '',
    bank_ifsc_code: '',
    bank_branch: ''
});

// ============================================
// Hook Implementation
// ============================================

export function useCompanyProfile() {
    const [profileData, setProfileData] = useState<CompanyProfileData>(getInitialData());
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasChanges, setHasChanges] = useState(false);

    // Metadata
    const [states, setStates] = useState<string[]>([]);
    const [businessTypes, setBusinessTypes] = useState<string[]>([
        'Pharmacy', 'Wholesaler', 'Distributor', 'Manufacturer', 'Hospital Pharmacy'
    ]);

    // Active Tab
    const [activeTab, setActiveTab] = useState<string>('basic');

    // Logo
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [logoPreview, setLogoPreview] = useState<string | null>(null);

    // ============================================
    // Load Data
    // ============================================

    const loadProfile = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const response = await settingsApi.getCompanyInfo();
            if (response.data?.success && response.data.data) {
                const data = response.data.data;
                setProfileData({
                    org_name: data.org_name || '',
                    legal_name: data.legal_name || '',
                    business_type: data.business_type || 'Pharmacy',
                    establishment_date: data.establishment_date || '',
                    gst_number: data.gst_number || '',
                    pan_number: data.pan_number || '',
                    cin_number: data.cin_number || '',
                    drug_license_number: data.drug_license_number || '',
                    fssai_number: data.fssai_number || '',
                    email_addresses: data.email_addresses || [''],
                    contact_numbers: data.contact_numbers || [''],
                    website: data.website || '',
                    registered_address: data.registered_address || '',
                    correspondence_address: data.correspondence_address || '',
                    city: data.city || '',
                    state: data.state || '',
                    pincode: data.pincode || '',
                    country: data.country || 'India',
                    bank_name: data.bank_details?.bank_name || '',
                    bank_account_number: data.bank_details?.account_number || '',
                    bank_ifsc_code: data.bank_details?.ifsc_code || '',
                    bank_branch: data.bank_details?.branch || ''
                });
                if (data.logo_url) {
                    setLogoPreview(data.logo_url);
                }
            }
        } catch (err) {
            setError('Failed to load company profile');
        } finally {
            setLoading(false);
        }
    }, []);

    const loadMetadata = useCallback(async () => {
        try {
            const response = await metadataApi.getStates();
            if (response.data) {
                setStates(response.data.map((s: any) => s.state || s.name || s));
            }
        } catch {
            setStates([
                'Andhra Pradesh', 'Karnataka', 'Kerala', 'Maharashtra', 'Tamil Nadu',
                'Telangana', 'Gujarat', 'Rajasthan', 'Uttar Pradesh', 'Delhi'
            ]);
        }
    }, []);

    // ============================================
    // Form Actions
    // ============================================

    const updateField = useCallback((field: keyof CompanyProfileData, value: any) => {
        setProfileData(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    }, []);

    const addArrayItem = useCallback((field: 'email_addresses' | 'contact_numbers') => {
        setProfileData(prev => ({
            ...prev,
            [field]: [...prev[field], '']
        }));
        setHasChanges(true);
    }, []);

    const updateArrayItem = useCallback((
        field: 'email_addresses' | 'contact_numbers',
        index: number,
        value: string
    ) => {
        setProfileData(prev => ({
            ...prev,
            [field]: prev[field].map((item, i) => i === index ? value : item)
        }));
        setHasChanges(true);
    }, []);

    const removeArrayItem = useCallback((
        field: 'email_addresses' | 'contact_numbers',
        index: number
    ) => {
        setProfileData(prev => ({
            ...prev,
            [field]: prev[field].filter((_, i) => i !== index)
        }));
        setHasChanges(true);
    }, []);

    const handleLogoChange = useCallback((file: File | null) => {
        setLogoFile(file);
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => setLogoPreview(e.target?.result as string);
            reader.readAsDataURL(file);
        }
        setHasChanges(true);
    }, []);

    // ============================================
    // Save
    // ============================================

    const saveProfile = useCallback(async () => {
        if (!profileData.org_name) {
            toast.error('Organization name is required');
            return false;
        }

        setSaving(true);
        try {
            const payload = {
                ...profileData,
                bank_details: {
                    bank_name: profileData.bank_name,
                    account_number: profileData.bank_account_number,
                    ifsc_code: profileData.bank_ifsc_code,
                    branch: profileData.bank_branch
                }
            };

            const response = await settingsApi.updateCompanyInfo(payload);
            if (response.data?.success) {
                toast.success('Company profile updated');
                setHasChanges(false);
                return true;
            } else {
                toast.error('Failed to save profile');
                return false;
            }
        } catch (err) {
            toast.error('Failed to save profile');
            return false;
        } finally {
            setSaving(false);
        }
    }, [profileData]);

    // ============================================
    // Initial Load
    // ============================================

    useEffect(() => {
        loadProfile();
        loadMetadata();
    }, [loadProfile, loadMetadata]);

    // ============================================
    // Return Value
    // ============================================

    return {
        // Data
        profileData,
        loading,
        saving,
        error,
        hasChanges,

        // Metadata
        states,
        businessTypes,

        // Tabs
        activeTab,
        setActiveTab,

        // Logo
        logoFile,
        logoPreview,
        handleLogoChange,

        // Form Actions
        updateField,
        addArrayItem,
        updateArrayItem,
        removeArrayItem,

        // Save
        saveProfile,

        // Reload
        loadProfile
    };
}

export default useCompanyProfile;
