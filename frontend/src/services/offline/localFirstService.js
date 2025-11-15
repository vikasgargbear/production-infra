/**
 * Local-First Data Service
 * Provides instant local search with cloud fallback and background sync
 * Inspired by Marg billing software's instant responsiveness
 */

import offlineDB from './offlineDatabase';
import { productAPI } from '../api';
import { customersApi } from '../api/modules/customers.api';

class LocalFirstService {
  constructor() {
    this.initialized = false;
    this.syncing = false;
    this.lastSyncTime = null;
    this.syncListeners = new Set();
  }

  /**
   * Initialize the service and seed local database
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await offlineDB.init();
      
      // Check if we need initial seed
      const products = await offlineDB.getAll('products');
      if (products.length === 0) {
        await this.seedInitialData();
      }
      
      this.initialized = true;
      
      // Start background sync
      this.startBackgroundSync();
    } catch (error) {
      console.error('Failed to initialize LocalFirstService:', error);
    }
  }

  /**
   * Seed initial data from cloud
   */
  async seedInitialData() {
    try {
      // // console.log('[LocalFirst] Seeding initial data...');
      
      // Fetch products
      const productsResponse = await productAPI.list({ limit: 1000 });
      const products = productsResponse?.data || productsResponse || [];
      
      // // console.log('[LocalFirst] Fetched products from cloud:', products.length);
      
      if (products.length > 0) {
        // Transform products to include search fields
        const transformedProducts = products.map(p => ({
          id: p.product_id || p.id,
          product_id: p.product_id || p.id,
          name: p.product_name || p.name,
          product_name: p.product_name || p.name,
          sku: p.product_code || p.code || p.sku,
          product_code: p.product_code || p.code || p.sku,
          hsn_code: p.hsn_code || p.hsn,
          category: p.category,
          mrp: p.mrp_per_unit || p.mrp || 0,
          sale_price: p.sale_price_per_unit || p.sale_price || p.selling_price || 0,
          selling_price: p.sale_price_per_unit || p.sale_price || p.selling_price || 0,
          current_stock: p.current_stock || p.stock || 0,
          gst_percent: p.gst_percent || p.tax_rate || 0,
          // Normalized search fields
          _search_name: (p.product_name || p.name || '').toLowerCase(),
          _search_code: (p.product_code || p.code || p.sku || '').toLowerCase(),
          _search_hsn: (p.hsn_code || p.hsn || '').toLowerCase(),
        }));
        
        await offlineDB.bulkLoad('products', transformedProducts);
        // console.log(`[LocalFirst] Seeded ${transformedProducts.length} products`);
      }
      
      // Fetch customers
      // // console.log('[LocalFirst] Fetching customers from cloud...');
      const customersResponse = await customersApi.getAll({ limit: 1000 });
      // // console.log('[LocalFirst] Raw customers response:', customersResponse);
      
      // Handle different response structures
      let customers = [];
      if (customersResponse?.data?.customers) {
        customers = customersResponse.data.customers;
      } else if (customersResponse?.customers) {
        customers = customersResponse.customers;
      } else if (customersResponse?.data) {
        customers = customersResponse.data;
      } else if (Array.isArray(customersResponse)) {
        customers = customersResponse;
      }
      
      // // console.log('[LocalFirst] Fetched customers from cloud:', customers.length);
      
      if (customers.length > 0) {
        // Transform customers to include search fields
        const transformedCustomers = customers.map(c => ({
          id: c.customer_id || c.id,
          customer_id: c.customer_id || c.id,
          name: c.customer_name || c.name,
          customer_name: c.customer_name || c.name,
          phone: c.phone || c.phone_number,
          phone_number: c.phone || c.phone_number,
          email: c.email,
          gst_number: c.gst_number || c.gstin,
          address: c.address,
          city: c.city,
          state: c.state,
          // Normalized search fields
          _search_name: (c.customer_name || c.name || '').toLowerCase(),
          _search_phone: (c.phone || c.phone_number || '').replace(/\D/g, ''),
          _search_gst: (c.gst_number || c.gstin || '').toLowerCase(),
        }));
        
        await offlineDB.bulkLoad('customers', transformedCustomers);
        // console.log(`[LocalFirst] Seeded ${transformedCustomers.length} customers to IndexedDB`);
      }
      
      this.lastSyncTime = Date.now();
      this.notifySyncListeners({ status: 'seeded', timestamp: this.lastSyncTime });
      // // console.log('[LocalFirst] Initial seed completed successfully');
    } catch (error) {
      console.error('[LocalFirst] Failed to seed initial data:', error);
      throw error;
    }
  }

  /**
   * Search products locally with instant results
   * Falls back to cloud if not found or data is stale
   */
  async searchProducts(query, options = {}) {
    const { limit = 20, forceCloud = false } = options;
    
    // Ensure initialized
    await this.initialize();
    
    if (!query || query.length < 2) {
      return [];
    }
    
    const searchTerm = query.toLowerCase();
    
    // Try local search first (instant)
    if (!forceCloud) {
      try {
        const allProducts = await offlineDB.getAll('products');
        
        // Multi-field fuzzy search
        const matches = allProducts.filter(product => {
          return (
            (product._search_name?.includes(searchTerm) || false) ||
            (product._search_code?.includes(searchTerm) || false) ||
            (product._search_hsn?.includes(searchTerm) || false) ||
            (product.name?.toLowerCase().includes(searchTerm) || false) ||
            (product.sku?.toLowerCase().includes(searchTerm) || false)
          );
        });
        
        // Sort by relevance (exact matches first)
        matches.sort((a, b) => {
          const aExact = a._search_name === searchTerm || a._search_code === searchTerm;
          const bExact = b._search_name === searchTerm || b._search_code === searchTerm;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return 0;
        });
        
        const results = matches.slice(0, limit);
        
        // If we have local results, return them instantly
        if (results.length > 0) {
          // Trigger background cloud search to update cache
          this.backgroundCloudSearch('products', query).catch(() => {});
          return results;
        }
      } catch (error) {
        console.error('Local product search failed:', error);
      }
    }
    
    // Fallback to cloud search
    return this.cloudSearchProducts(query, limit);
  }

  /**
   * Search customers locally with instant results
   */
  async searchCustomers(query, options = {}) {
    const { limit = 20, forceCloud = false } = options;
    
    // Ensure initialized
    await this.initialize();
    
    if (!query || query.length < 2) {
      return [];
    }
    
    const searchTerm = query.toLowerCase();
    const phoneDigits = query.replace(/\D/g, '');
    
    // Try local search first (instant)
    if (!forceCloud) {
      try {
        const allCustomers = await offlineDB.getAll('customers');
        // // console.log('[LocalFirst] Customer search - total local customers:', allCustomers.length);
        
        // Multi-field fuzzy search
        const matches = allCustomers.filter(customer => {
          // Only check fields if the search term is meaningful
          const nameMatch = customer._search_name?.includes(searchTerm) || false;
          const phoneMatch = phoneDigits.length > 0 && customer._search_phone?.includes(phoneDigits) || false;
          const gstMatch = customer._search_gst?.includes(searchTerm) || false;
          const nameDirectMatch = customer.name?.toLowerCase().includes(searchTerm) || false;
          const emailMatch = customer.email?.toLowerCase().includes(searchTerm) || false;
          
          const isMatch = nameMatch || phoneMatch || gstMatch || nameDirectMatch || emailMatch;
          
          return isMatch;
        });
        
        // // console.log('[LocalFirst] Customer search - matches found:', matches.length);
        
        // Sort by relevance
        matches.sort((a, b) => {
          const aExact = a._search_name === searchTerm || a._search_phone === phoneDigits;
          const bExact = b._search_name === searchTerm || b._search_phone === phoneDigits;
          if (aExact && !bExact) return -1;
          if (!aExact && bExact) return 1;
          return 0;
        });
        
        const results = matches.slice(0, limit);
        
        // If we have local results, return them instantly
        if (results.length > 0) {
          // // console.log('[LocalFirst] Returning local customer results:', results.length);
          // Trigger background cloud search to update cache
          this.backgroundCloudSearch('customers', query).catch(() => {});
          return results;
        }
        
        // // console.log('[LocalFirst] No local customers found, falling back to cloud');
      } catch (error) {
        console.error('Local customer search failed:', error);
      }
    }
    
    // Fallback to cloud search
    return this.cloudSearchCustomers(query, limit);
  }

  /**
   * Cloud search for products (fallback)
   */
  async cloudSearchProducts(query, limit = 20) {
    try {
      const response = await productAPI.search(query, { limit });
      const results = response?.data || response || [];
      
      // Update local cache in background
      if (results.length > 0) {
        this.updateLocalCache('products', results).catch(() => {});
      }
      
      return results;
    } catch (error) {
      console.error('Cloud product search failed:', error);
      return [];
    }
  }

  /**
   * Cloud search for customers (fallback)
   */
  async cloudSearchCustomers(query, limit = 20) {
    try {
      // // console.log('[LocalFirst] Calling cloud API for customers, query:', query);
      const response = await customersApi.search(query, { limit });
      // // console.log('[LocalFirst] Cloud API response:', response);
      
      // Handle different response structures
      let results = [];
      if (response?.data?.customers) {
        results = response.data.customers;
      } else if (response?.customers) {
        results = response.customers;
      } else if (response?.data) {
        results = response.data;
      } else if (Array.isArray(response)) {
        results = response;
      }
      
      // // console.log('[LocalFirst] Extracted customer results:', results.length);
      
      // Update local cache in background
      if (results.length > 0) {
        this.updateLocalCache('customers', results).catch(() => {});
      }
      
      return results;
    } catch (error) {
      console.error('[LocalFirst] Cloud customer search failed:', error);
      return [];
    }
  }

  /**
   * Background cloud search to update cache
   */
  async backgroundCloudSearch(type, query) {
    if (type === 'products') {
      return this.cloudSearchProducts(query, 50);
    } else if (type === 'customers') {
      return this.cloudSearchCustomers(query, 50);
    }
  }

  /**
   * Update local cache with cloud data
   */
  async updateLocalCache(storeName, items) {
    try {
      for (const item of items) {
        let transformed;
        
        if (storeName === 'products') {
          transformed = {
            id: item.product_id || item.id,
            product_id: item.product_id || item.id,
            name: item.product_name || item.name,
            product_name: item.product_name || item.name,
            sku: item.product_code || item.code || item.sku,
            product_code: item.product_code || item.code || item.sku,
            hsn_code: item.hsn_code || item.hsn,
            category: item.category,
            mrp: item.mrp_per_unit || item.mrp || 0,
            sale_price: item.sale_price_per_unit || item.sale_price || item.selling_price || 0,
            selling_price: item.sale_price_per_unit || item.sale_price || item.selling_price || 0,
            current_stock: item.current_stock || item.stock || 0,
            gst_percent: item.gst_percent || item.tax_rate || 0,
            _search_name: (item.product_name || item.name || '').toLowerCase(),
            _search_code: (item.product_code || item.code || item.sku || '').toLowerCase(),
            _search_hsn: (item.hsn_code || item.hsn || '').toLowerCase(),
          };
        } else if (storeName === 'customers') {
          transformed = {
            id: item.customer_id || item.id,
            customer_id: item.customer_id || item.id,
            name: item.customer_name || item.name,
            customer_name: item.customer_name || item.name,
            phone: item.phone || item.phone_number,
            phone_number: item.phone || item.phone_number,
            email: item.email,
            gst_number: item.gst_number || item.gstin,
            address: item.address,
            city: item.city,
            state: item.state,
            _search_name: (item.customer_name || item.name || '').toLowerCase(),
            _search_phone: (item.phone || item.phone_number || '').replace(/\D/g, ''),
            _search_gst: (item.gst_number || item.gstin || '').toLowerCase(),
          };
        }
        
        if (transformed) {
          await offlineDB.update(storeName, transformed);
        }
      }
    } catch (error) {
      console.error(`Failed to update ${storeName} cache:`, error);
    }
  }

  /**
   * Start background sync to keep data fresh
   */
  startBackgroundSync() {
    // Sync every 5 minutes when online
    setInterval(() => {
      if (navigator.onLine && !this.syncing) {
        this.syncInBackground();
      }
    }, 5 * 60 * 1000); // 5 minutes
  }

  /**
   * Background sync without blocking UI
   */
  async syncInBackground() {
    if (this.syncing) return;
    
    this.syncing = true;
    this.notifySyncListeners({ status: 'syncing' });
    
    try {
      // Fetch latest products
      const productsResponse = await productAPI.list({ 
        limit: 1000,
        updated_since: this.lastSyncTime ? new Date(this.lastSyncTime).toISOString() : undefined
      });
      const products = productsResponse?.data || productsResponse || [];
      
      if (products.length > 0) {
        await this.updateLocalCache('products', products);
      }
      
      // Fetch latest customers
      const customersResponse = await customersApi.getAll({ 
        limit: 1000,
        updated_since: this.lastSyncTime ? new Date(this.lastSyncTime).toISOString() : undefined
      });
      const customers = customersResponse?.data || customersResponse || [];
      
      if (customers.length > 0) {
        await this.updateLocalCache('customers', customers);
      }
      
      this.lastSyncTime = Date.now();
      this.notifySyncListeners({ 
        status: 'synced', 
        timestamp: this.lastSyncTime,
        productsUpdated: products.length,
        customersUpdated: customers.length
      });
    } catch (error) {
      console.error('Background sync failed:', error);
      this.notifySyncListeners({ status: 'error', error });
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Force sync now
   */
  async syncNow() {
    return this.syncInBackground();
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    return {
      initialized: this.initialized,
      syncing: this.syncing,
      lastSyncTime: this.lastSyncTime,
      isOnline: navigator.onLine
    };
  }

  /**
   * Subscribe to sync events
   */
  onSyncStatusChange(callback) {
    this.syncListeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.syncListeners.delete(callback);
    };
  }

  /**
   * Notify all sync listeners
   */
  notifySyncListeners(event) {
    this.syncListeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Sync listener error:', error);
      }
    });
  }

  /**
   * Clear all local data
   */
  async clearLocalData() {
    await offlineDB.clearAll();
    this.initialized = false;
    this.lastSyncTime = null;
  }
}

// Export singleton instance
const localFirstService = new LocalFirstService();
export default localFirstService;
