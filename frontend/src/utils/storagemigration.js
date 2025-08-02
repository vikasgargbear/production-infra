/**
 * Storage Migration Utility
 * Migrates existing localStorage data to secure storage
 * Removes sensitive data from localStorage
 */

import SecurityService from '../services/securityService';
import secureCompanySettings from './secureCompanySettings';

class StorageMigration {
  
  /**
   * Migrate all localStorage data to secure storage
   */
  static async migrateToSecureStorage() {
    console.log('Starting storage migration...');
    
    try {
      // Migrate company settings
      this.migrateCompanySettings();
      
      // Migrate invoice drafts
      this.migrateInvoiceDrafts();
      
      // Migrate user preferences
      this.migrateUserPreferences();
      
      // Clean up old localStorage data
      this.cleanupOldData();
      
      // Mark migration as completed
      localStorage.setItem('storage_migration_completed', 'true');
      localStorage.setItem('storage_migration_date', new Date().toISOString());
      
      console.log('Storage migration completed successfully');
      return true;
    } catch (error) {
      console.error('Storage migration failed:', error);
      return false;
    }
  }
  
  /**
   * Migrate company settings from localStorage
   */
  static migrateCompanySettings() {
    console.log('Migrating company settings...');
    
    // Migrate public settings
    const publicSettings = {
      company_name: localStorage.getItem('companyName'),
      address: localStorage.getItem('companyAddress'),
      phone: localStorage.getItem('companyPhone'),
      email: localStorage.getItem('companyEmail'),
      website: localStorage.getItem('companyWebsite'),
      logo_url: localStorage.getItem('companyLogo')
    };
    
    // Filter out null values
    const filteredPublic = Object.fromEntries(
      Object.entries(publicSettings).filter(([_, value]) => value !== null)
    );
    
    if (Object.keys(filteredPublic).length > 0) {
      SecurityService.storeCompanyPublicSettings(filteredPublic);
    }
    
    // Migrate secure settings to memory
    const secureSettings = {
      gstin: localStorage.getItem('companyGST'),
      state_code: localStorage.getItem('companyStateCode'),
      bank_details: this.getBankDetailsFromStorage(),
      license_details: this.getLicenseDetailsFromStorage()
    };
    
    // Filter out null values
    const filteredSecure = Object.fromEntries(
      Object.entries(secureSettings).filter(([_, value]) => value !== null)
    );
    
    if (Object.keys(filteredSecure).length > 0) {
      SecurityService.storeCompanySecureSettings(filteredSecure);
    }
  }
  
  /**
   * Extract bank details from localStorage
   */
  static getBankDetailsFromStorage() {
    const bankName = localStorage.getItem('companyBankName');
    const accountNumber = localStorage.getItem('companyAccountNumber');
    const ifsc = localStorage.getItem('companyIFSC');
    const branch = localStorage.getItem('companyBranch');
    
    if (bankName || accountNumber || ifsc || branch) {
      return {
        bank_name: bankName,
        account_number: accountNumber,
        ifsc: ifsc,
        branch: branch
      };
    }
    
    return null;
  }
  
  /**
   * Extract license details from localStorage
   */
  static getLicenseDetailsFromStorage() {
    const drugLicense = localStorage.getItem('companyDrugLicense');
    const gstRegistration = localStorage.getItem('companyGSTRegistration');
    const fssaiLicense = localStorage.getItem('companyFSSAILicense');
    
    if (drugLicense || gstRegistration || fssaiLicense) {
      return {
        drug_license: drugLicense,
        gst_registration: gstRegistration,
        fssai_license: fssaiLicense
      };
    }
    
    return null;
  }
  
  /**
   * Migrate invoice drafts from localStorage
   */
  static migrateInvoiceDrafts() {
    console.log('Migrating invoice drafts...');
    
    const drafts = [];
    
    // Look for draft data in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      
      if (key?.startsWith('invoice_draft_') || key?.startsWith('draft_')) {
        try {
          const draftData = JSON.parse(localStorage.getItem(key));
          const draftId = key.replace('invoice_draft_', '').replace('draft_', '');
          
          // Sanitize draft data
          const safeDraft = {
            customer_id: draftData.customer_id,
            customer_name: draftData.customer_name,
            items: draftData.items?.map(item => ({
              product_id: item.product_id,
              product_name: item.product_name,
              batch_id: item.batch_id,
              quantity: item.quantity,
              discount_percent: item.discount_percent
            })),
            totals: {
              item_count: draftData.items?.length || 0,
              gross_amount: draftData.gross_amount || 0
            }
          };
          
          SecurityService.storeDraft(draftId, safeDraft);
          drafts.push(draftId);
        } catch (error) {
          console.warn(`Failed to migrate draft ${key}:`, error);
        }
      }
    }
    
    console.log(`Migrated ${drafts.length} invoice drafts`);
  }
  
  /**
   * Migrate user preferences from localStorage
   */
  static migrateUserPreferences() {
    console.log('Migrating user preferences...');
    
    const preferences = {
      theme: localStorage.getItem('userTheme'),
      language: localStorage.getItem('userLanguage'),
      currency_format: localStorage.getItem('currencyFormat'),
      date_format: localStorage.getItem('dateFormat'),
      items_per_page: localStorage.getItem('itemsPerPage'),
      default_payment_mode: localStorage.getItem('defaultPaymentMode'),
      show_gst_calculator: localStorage.getItem('showGSTCalculator') === 'true'
    };
    
    // Filter out null values
    const filteredPreferences = Object.fromEntries(
      Object.entries(preferences).filter(([_, value]) => value !== null)
    );
    
    if (Object.keys(filteredPreferences).length > 0) {
      SecurityService.storeUserPreferences(filteredPreferences);
    }
  }
  
  /**
   * Clean up old localStorage data
   */
  static cleanupOldData() {
    console.log('Cleaning up old localStorage data...');
    
    const keysToRemove = [
      // Company settings (sensitive)
      'companyGST', 'companyGSTIN', 'companyStateCode',
      'companyBankName', 'companyAccountNumber', 'companyIFSC', 'companyBranch',
      'companyDrugLicense', 'companyGSTRegistration', 'companyFSSAILicense',
      
      // User session data (potentially sensitive)
      'userToken', 'authToken', 'sessionToken',
      'currentUser', 'userData', 'userProfile',
      
      // API keys or credentials (if any)
      'apiKey', 'clientSecret', 'accessToken',
      
      // Old draft formats
      'invoiceDraft', 'tempInvoice', 'lastInvoice',
      
      // Cache that might contain sensitive data
      'productCache', 'customerCache', 'batchCache',
      
      // Other potentially sensitive data
      'lastCustomer', 'recentProducts', 'calculationCache'
    ];
    
    // Remove specific keys
    keysToRemove.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
        console.log(`Removed sensitive data: ${key}`);
      }
    });
    
    // Remove any keys that match sensitive patterns
    const sensitivePatterns = [
      /^invoice_draft_/,
      /^draft_/,
      /^user_/,
      /^auth_/,
      /^token_/,
      /^api_/,
      /^cache_/,
      /_cache$/,
      /_token$/,
      /_key$/
    ];
    
    const keysToCheck = [];
    for (let i = 0; i < localStorage.length; i++) {
      keysToCheck.push(localStorage.key(i));
    }
    
    keysToCheck.forEach(key => {
      if (sensitivePatterns.some(pattern => pattern.test(key))) {
        localStorage.removeItem(key);
        console.log(`Removed pattern-matched sensitive data: ${key}`);
      }
    });
    
    console.log('localStorage cleanup completed');
  }
  
  /**
   * Check if migration is needed
   */
  static needsMigration() {
    return localStorage.getItem('storage_migration_completed') !== 'true';
  }
  
  /**
   * Get migration status
   */
  static getMigrationStatus() {
    return {
      completed: localStorage.getItem('storage_migration_completed') === 'true',
      date: localStorage.getItem('storage_migration_date'),
      security_status: SecurityService.getSecurityStatus()
    };
  }
  
  /**
   * Force re-migration (for testing)
   */
  static forceMigration() {
    localStorage.removeItem('storage_migration_completed');
    localStorage.removeItem('storage_migration_date');
    return this.migrateToSecureStorage();
  }
  
  /**
   * Audit remaining localStorage data
   */
  static auditLocalStorage() {
    const remainingKeys = [];
    const suspiciousKeys = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      remainingKeys.push(key);
      
      // Check for potentially sensitive data
      const suspiciousPatterns = [
        /password/i, /token/i, /key/i, /secret/i,
        /gstin/i, /gst/i, /bank/i, /account/i,
        /license/i, /credential/i, /auth/i
      ];
      
      if (suspiciousPatterns.some(pattern => pattern.test(key))) {
        suspiciousKeys.push(key);
      }
    }
    
    return {
      total_keys: remainingKeys.length,
      all_keys: remainingKeys,
      suspicious_keys: suspiciousKeys,
      recommendation: suspiciousKeys.length > 0 
        ? 'Review and remove suspicious keys'
        : 'localStorage appears clean'
    };
  }
}

export default StorageMigration;