/**
 * Secure Company Settings Helper
 * Replaces the old companySettings with secure storage patterns
 * Removes sensitive data from localStorage
 */

import SecurityService from '../services/securityService';

export const secureCompanySettings = {
  // Default public company information (non-sensitive)
  DEFAULT_PUBLIC_SETTINGS: {
    company_name: 'AASO Pharmaceuticals',
    address: 'Gangapur City, Rajasthan',
    phone: '+91-XXX-XXX-XXXX',
    email: 'info@aasopharma.com',
    website: 'www.aasopharma.com'
  },
  
  // Default GSTIN (this should come from backend in production)
  DEFAULT_GSTIN: '27AABCU9603R1ZM',
  
  /**
   * Initialize secure company settings
   */
  initialize() {
    // Store public settings in encrypted localStorage
    const existingPublic = SecurityService.getCompanyPublicSettings();
    if (!existingPublic.company_name) {
      SecurityService.storeCompanyPublicSettings(this.DEFAULT_PUBLIC_SETTINGS);
    }
    
    console.log('Secure company settings initialized');
  },
  
  /**
   * Get company GSTIN (tries secure storage first, then fallback)
   * @returns {String} GSTIN
   */
  getGSTIN() {
    // Try to get from secure memory storage first
    const secureSettings = SecurityService.getCompanySecureSettings();
    if (secureSettings?.gstin) {
      return secureSettings.gstin;
    }
    
    // Fallback to default (in production, this should trigger a backend call)
    return this.DEFAULT_GSTIN;
  },
  
  /**
   * Get company state code from GSTIN
   * @returns {String} State code
   */
  getStateCode() {
    const gstin = this.getGSTIN();
    return gstin ? gstin.substring(0, 2) : '27';
  },
  
  /**
   * Get company name from public settings
   * @returns {String} Company name
   */
  getCompanyName() {
    const publicSettings = SecurityService.getCompanyPublicSettings();
    return publicSettings.company_name || this.DEFAULT_PUBLIC_SETTINGS.company_name;
  },
  
  /**
   * Get company address from public settings
   * @returns {String} Company address
   */
  getCompanyAddress() {
    const publicSettings = SecurityService.getCompanyPublicSettings();
    return publicSettings.address || this.DEFAULT_PUBLIC_SETTINGS.address;
  },
  
  /**
   * Get company phone from public settings
   * @returns {String} Company phone
   */
  getCompanyPhone() {
    const publicSettings = SecurityService.getCompanyPublicSettings();
    return publicSettings.phone || this.DEFAULT_PUBLIC_SETTINGS.phone;
  },
  
  /**
   * Get company email from public settings
   * @returns {String} Company email
   */
  getCompanyEmail() {
    const publicSettings = SecurityService.getCompanyPublicSettings();
    return publicSettings.email || this.DEFAULT_PUBLIC_SETTINGS.email;
  },
  
  /**
   * Update company public settings (non-sensitive)
   * @param {Object} settings - Public settings to update
   */
  updatePublicSettings(settings) {
    const currentSettings = SecurityService.getCompanyPublicSettings();
    const updatedSettings = {
      ...currentSettings,
      ...settings,
      // Ensure no sensitive data is stored
      gstin: undefined,
      bank_details: undefined,
      license_details: undefined
    };
    
    SecurityService.storeCompanyPublicSettings(updatedSettings);
  },
  
  /**
   * Update company secure settings (stored in memory only)
   * @param {Object} settings - Secure settings to update
   */
  updateSecureSettings(settings) {
    SecurityService.storeCompanySecureSettings(settings);
  },
  
  /**
   * Get complete company settings for invoice/documents
   * @returns {Object} Complete company information
   */
  getCompleteSettings() {
    const publicSettings = SecurityService.getCompanyPublicSettings();
    const secureSettings = SecurityService.getCompanySecureSettings();
    
    return {
      // Public information
      company_name: publicSettings.company_name || this.DEFAULT_PUBLIC_SETTINGS.company_name,
      address: publicSettings.address || this.DEFAULT_PUBLIC_SETTINGS.address,
      phone: publicSettings.phone || this.DEFAULT_PUBLIC_SETTINGS.phone,
      email: publicSettings.email || this.DEFAULT_PUBLIC_SETTINGS.email,
      website: publicSettings.website || this.DEFAULT_PUBLIC_SETTINGS.website,
      logo_url: publicSettings.logo_url,
      
      // Secure information (only if available in memory)
      gstin: secureSettings?.gstin || this.DEFAULT_GSTIN,
      state_code: this.getStateCode(),
      state_name: this.getStateName(this.getStateCode()),
      
      // Masked sensitive information
      bank_details: secureSettings?.bank_details ? {
        bank_name: secureSettings.bank_details.bank_name,
        account_number: this.maskAccountNumber(secureSettings.bank_details.account_number),
        ifsc: secureSettings.bank_details.ifsc,
        branch: secureSettings.bank_details.branch
      } : null,
      
      license_details: secureSettings?.license_details || null
    };
  },
  
  /**
   * Mask account number for display
   * @param {String} accountNumber - Account number
   * @returns {String} Masked account number
   */
  maskAccountNumber(accountNumber) {
    if (!accountNumber || accountNumber.length < 4) {
      return '****';
    }
    
    const lastFour = accountNumber.slice(-4);
    const masked = '*'.repeat(Math.max(0, accountNumber.length - 4));
    return masked + lastFour;
  },
  
  /**
   * State code to name mapping
   * @param {String} code - State code
   * @returns {String|null} State name
   */
  getStateName(code) {
    const states = {
      '01': 'Jammu and Kashmir',
      '02': 'Himachal Pradesh',
      '03': 'Punjab',
      '04': 'Chandigarh',
      '05': 'Uttarakhand',
      '06': 'Haryana',
      '07': 'Delhi',
      '08': 'Rajasthan',
      '09': 'Uttar Pradesh',
      '10': 'Bihar',
      '11': 'Sikkim',
      '12': 'Arunachal Pradesh',
      '13': 'Nagaland',
      '14': 'Manipur',
      '15': 'Mizoram',
      '16': 'Tripura',
      '17': 'Meghalaya',
      '18': 'Assam',
      '19': 'West Bengal',
      '20': 'Jharkhand',
      '21': 'Odisha',
      '22': 'Chhattisgarh',
      '23': 'Madhya Pradesh',
      '24': 'Gujarat',
      '25': 'Daman and Diu',
      '26': 'Dadra and Nagar Haveli',
      '27': 'Maharashtra',
      '28': 'Andhra Pradesh',
      '29': 'Karnataka',
      '30': 'Goa',
      '31': 'Lakshadweep',
      '32': 'Kerala',
      '33': 'Tamil Nadu',
      '34': 'Puducherry',
      '35': 'Andaman and Nicobar Islands',
      '36': 'Telangana',
      '37': 'Andhra Pradesh (New)',
      '38': 'Ladakh'
    };
    
    return states[code] || null;
  },
  
  /**
   * Validate GSTIN format
   * @param {String} gstin - GSTIN to validate
   * @returns {Boolean} Is valid GSTIN
   */
  validateGSTIN(gstin) {
    if (!gstin || typeof gstin !== 'string') {
      return false;
    }
    
    // GSTIN format: 2 digits state code + 10 alphanumeric PAN + 1 check digit + 1 alphabet + 1 alphabet/digit
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstinRegex.test(gstin);
  },
  
  /**
   * Clear all company settings (for logout)
   */
  clearSettings() {
    SecurityService.logout();
  },
  
  /**
   * Get settings for invoice printing (safe subset)
   * @returns {Object} Invoice-safe settings
   */
  getInvoiceSettings() {
    const complete = this.getCompleteSettings();
    
    return {
      company_name: complete.company_name,
      address: complete.address,
      phone: complete.phone,
      email: complete.email,
      gstin: complete.gstin,
      state_name: complete.state_name,
      logo_url: complete.logo_url
    };
  },
  
  /**
   * Check if secure settings are loaded
   * @returns {Boolean} Are secure settings available
   */
  hasSecureSettings() {
    return SecurityService.getCompanySecureSettings() !== null;
  },
  
  /**
   * Load secure settings from backend (placeholder)
   * In production, this should make an API call
   * @returns {Promise<Boolean>} Success status
   */
  async loadSecureSettingsFromBackend() {
    try {
      // TODO: Replace with actual API call
      // const response = await api.get('/api/v1/company/settings/secure');
      // SecurityService.storeCompanySecureSettings(response.data);
      
      // For now, simulate loading default secure settings
      const defaultSecure = {
        gstin: this.DEFAULT_GSTIN,
        state_code: '27',
        bank_details: {
          bank_name: 'Example Bank',
          account_number: '1234567890',
          ifsc: 'EXAM0001234',
          branch: 'Main Branch'
        },
        license_details: {
          drug_license: 'DL-123456',
          gst_registration: 'GST-789012'
        }
      };
      
      SecurityService.storeCompanySecureSettings(defaultSecure);
      return true;
    } catch (error) {
      console.error('Failed to load secure settings:', error);
      return false;
    }
  }
};

// Initialize secure settings on import
secureCompanySettings.initialize();

export default secureCompanySettings;