/**
 * Enterprise Organization ID Manager
 * Single source of truth for organization ID management
 * 
 * This manager ensures org_id is ALWAYS available for API calls
 * It handles initialization, storage, retrieval, and fallbacks
 */

class OrgIdManager {
  constructor() {
    // NO DEFAULT ORG_ID - must come from authentication
    this.DEFAULT_ORG_ID = null;
    
    // Storage keys to check (in priority order)
    this.STORAGE_KEYS = [
      'pharma_org_id',
      'org_id', 
      'orgId',
      'organization_id'
    ];
    
    // Initialize immediately
    this.initialize();
  }

  /**
   * Initialize org_id on manager creation
   * This runs synchronously to ensure org_id is available
   */
  initialize() {
    // Try to get existing org_id from storage
    const orgId = this.getFromStorage();
    
    if (orgId) {
      // Ensure it's in all storage locations
      this.syncStorage(orgId);
      this.currentOrgId = orgId;
    } else {
      // NO org_id - user must login
      this.currentOrgId = null;
      console.warn('OrgIdManager: No org_id found. User must login.');
    }
    
    // Set up storage event listener for cross-tab sync
    this.setupStorageListener();
  }

  /**
   * Get org_id from storage (checks multiple keys)
   */
  getFromStorage() {
    // Check sessionStorage first (tab-specific)
    for (const key of this.STORAGE_KEYS) {
      const value = sessionStorage.getItem(key);
      if (value) return value;
    }
    
    // Then check localStorage (persistent)
    for (const key of this.STORAGE_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return value;
    }
    
    return null;
  }

  /**
   * Set org_id in all storage locations
   */
  setInStorage(orgId) {
    if (!orgId) return;
    
    // Set in localStorage (persistent)
    localStorage.setItem('pharma_org_id', orgId);
    localStorage.setItem('org_id', orgId);
    localStorage.setItem('orgId', orgId);
    
    // Set in sessionStorage (tab-specific)
    sessionStorage.setItem('pharma_org_id', orgId);
    sessionStorage.setItem('org_id', orgId);
    sessionStorage.setItem('orgId', orgId);
  }

  /**
   * Sync org_id across all storage locations
   */
  syncStorage(orgId) {
    if (!orgId) return;
    
    // Ensure it's in all locations
    const keys = ['pharma_org_id', 'org_id', 'orgId'];
    
    keys.forEach(key => {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, orgId);
      }
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, orgId);
      }
    });
  }

  /**
   * Get current org_id (NO FALLBACK - must be authenticated)
   */
  getOrgId() {
    // First try memory
    if (this.currentOrgId) {
      return this.currentOrgId;
    }
    
    // Then try storage
    const storedOrgId = this.getFromStorage();
    if (storedOrgId) {
      this.currentOrgId = storedOrgId;
      return storedOrgId;
    }
    
    // NO FALLBACK - return null if not authenticated
    console.error('CRITICAL: No org_id available. User must login first.');
    return null;
  }

  /**
   * Update org_id (e.g., after login or org switch)
   */
  setOrgId(orgId) {
    if (!orgId) {
      return false;
    }
    
    this.currentOrgId = orgId;
    this.setInStorage(orgId);
    
    // Notify listeners (if any)
    this.notifyListeners(orgId);
    
    return true;
  }

  /**
   * Clear org_id (e.g., on logout)
   */
  clearOrgId() {
    this.currentOrgId = null;
    
    // Clear from all storage locations
    this.STORAGE_KEYS.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  }

  /**
   * Set up storage event listener for cross-tab synchronization
   */
  setupStorageListener() {
    window.addEventListener('storage', (e) => {
      if (this.STORAGE_KEYS.includes(e.key) && e.newValue) {
        this.currentOrgId = e.newValue;
        this.syncStorage(e.newValue);
      }
    });
  }

  /**
   * Listener management for org_id changes
   */
  listeners = [];
  
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }
  
  notifyListeners(orgId) {
    this.listeners.forEach(callback => {
      try {
        callback(orgId);
      } catch (error) {
        // Silently handle listener errors
      }
    });
  }

  /**
   * Validate org_id format (UUID v4)
   */
  isValidOrgId(orgId) {
    if (!orgId) return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(orgId);
  }

  /**
   * Get diagnostic information
   */
  getDiagnostics() {
    return {
      currentOrgId: this.currentOrgId,
      localStorage: {
        pharma_org_id: localStorage.getItem('pharma_org_id'),
        org_id: localStorage.getItem('org_id'),
        orgId: localStorage.getItem('orgId')
      },
      sessionStorage: {
        pharma_org_id: sessionStorage.getItem('pharma_org_id'),
        org_id: sessionStorage.getItem('org_id'),
        orgId: sessionStorage.getItem('orgId')
      },
      isValid: this.isValidOrgId(this.currentOrgId),
      hasAuth: !!localStorage.getItem('authToken')
    };
  }
}

// Create singleton instance
const orgIdManager = new OrgIdManager();

// Export for use in other modules
export default orgIdManager;

// Also export as named export for convenience
export { orgIdManager };