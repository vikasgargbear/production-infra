/**
 * Offline-First Calculator Service
 * Enterprise-grade local calculations with background sync
 * Works like SAP, Oracle, and other enterprise systems
 */

class OfflineCalculator {
  /**
   * Initialize with optional config
   */
  constructor() {
    this.syncQueue = [];
    this.isSyncing = false;
  }

  /**
   * Calculate invoice locally - ALWAYS INSTANT
   * This is the primary calculation method for offline support
   */
  static calculate(invoiceData) {
    const items = invoiceData.items || [];
    const gstType = invoiceData.gst_type || 'CGST/SGST';
    const deliveryCharges = parseFloat(invoiceData.delivery_charges) || 0;
    const additionalDiscount = parseFloat(invoiceData.discount_amount) || 0;
    
    // Process items in single pass for performance
    let grossAmount = 0;
    let totalDiscount = 0;
    let taxableAmount = 0;
    let totalGst = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;
    
    const calculatedItems = items.map(item => {
      // Parse once
      const rate = parseFloat(item.sale_price || item.rate || item.selling_price || item.unit_price) || 0;
      const baseQuantity = parseFloat(item.base_quantity || item.quantity) || 0;
      const freeQuantity = parseFloat(item.free_quantity) || 0;
      const discountPercent = parseFloat(item.discount_percent || item.discount) || 0;
      const gstPercent = parseFloat(item.gst_percent || item.tax_rate || item.gst) || 12;
      
      // Calculate
      const subtotal = rate * baseQuantity;
      const discountAmount = (subtotal * discountPercent) / 100;
      const taxableAmt = subtotal - discountAmount;
      const gstAmount = (taxableAmt * gstPercent) / 100;
      const totalAmount = taxableAmt + gstAmount;
      
      // GST split
      const cgstAmount = gstType === 'CGST/SGST' ? gstAmount / 2 : 0;
      const sgstAmount = gstType === 'CGST/SGST' ? gstAmount / 2 : 0;
      const igstAmount = gstType === 'IGST' ? gstAmount : 0;
      
      // Accumulate
      grossAmount += subtotal;
      totalDiscount += discountAmount;
      taxableAmount += taxableAmt;
      totalGst += gstAmount;
      cgstTotal += cgstAmount;
      sgstTotal += sgstAmount;
      igstTotal += igstAmount;
      
      // Return enriched item
      return {
        ...item,
        // Core fields
        base_quantity: baseQuantity,
        free_quantity: freeQuantity,
        total_quantity: baseQuantity + freeQuantity,
        rate: this.round(rate),
        subtotal: this.round(subtotal),
        discount_percent: discountPercent,
        discount_amount: this.round(discountAmount),
        taxable_amount: this.round(taxableAmt),
        gst_percent: gstPercent,
        gst_amount: this.round(gstAmount),
        cgst_amount: this.round(cgstAmount),
        sgst_amount: this.round(sgstAmount),
        igst_amount: this.round(igstAmount),
        total_amount: this.round(totalAmount),
        line_total: this.round(totalAmount),
        calculated_total: this.round(totalAmount),
        // Legacy support
        tax_amount: this.round(gstAmount),
        cgst: this.round(cgstAmount),
        sgst: this.round(sgstAmount),
        igst: this.round(igstAmount)
      };
    });
    
    // Final totals
    const netAmount = taxableAmount + totalGst + deliveryCharges - additionalDiscount;
    const roundOff = parseFloat((Math.round(netAmount) - netAmount).toFixed(2));
    const finalAmount = Math.round(netAmount);
    
    return {
      success: true,
      line_items: calculatedItems,
      totals: {
        gross_amount: this.round(grossAmount),
        total_discount: this.round(totalDiscount),
        taxable_amount: this.round(taxableAmount),
        total_gst: this.round(totalGst),
        total_tax: this.round(totalGst),
        cgst_amount: this.round(cgstTotal),
        sgst_amount: this.round(sgstTotal),
        igst_amount: this.round(igstTotal),
        delivery_charges: this.round(deliveryCharges),
        additional_discount: this.round(additionalDiscount),
        net_amount: this.round(netAmount),
        round_off: this.round(roundOff),
        final_amount: finalAmount,
        // Display aliases
        subtotal_amount: this.round(taxableAmount),
        discount_amount: this.round(totalDiscount),
        tax_amount: this.round(totalGst)
      },
      timestamp: new Date().toISOString(),
      offline: true
    };
  }
  
  /**
   * Queue for background sync when online
   */
  static queueForSync(invoiceData) {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      // Use Background Sync API if available
      navigator.serviceWorker.ready.then(registration => {
        return registration.sync.register('invoice-sync');
      });
    }
    
    // Store in IndexedDB for offline persistence
    this.storeOffline(invoiceData);
  }
  
  /**
   * Store data offline using IndexedDB
   */
  static async storeOffline(data) {
    if (!window.indexedDB) {
      console.warn('IndexedDB not supported');
      return;
    }
    
    try {
      const db = await this.openDB();
      const tx = db.transaction(['invoices'], 'readwrite');
      const store = tx.objectStore('invoices');
      
      await store.put({
        ...data,
        id: data.id || Date.now(),
        synced: false,
        createdAt: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to store offline:', error);
    }
  }
  
  /**
   * Open IndexedDB connection
   */
  static openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('PharmaERP', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('invoices')) {
          const store = db.createObjectStore('invoices', { keyPath: 'id' });
          store.createIndex('synced', 'synced', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }
  
  /**
   * Sync pending invoices when online
   */
  static async syncPending() {
    if (!navigator.onLine) {
      return;
    }
    
    try {
      const db = await this.openDB();
      const tx = db.transaction(['invoices'], 'readonly');
      const store = tx.objectStore('invoices');
      const index = store.index('synced');
      const pending = await index.getAll(false);
      
      for (const invoice of pending) {
        try {
          // Sync with backend
          await this.syncWithBackend(invoice);
          
          // Mark as synced
          const updateTx = db.transaction(['invoices'], 'readwrite');
          const updateStore = updateTx.objectStore('invoices');
          invoice.synced = true;
          await updateStore.put(invoice);
        } catch (error) {
          console.error('Failed to sync invoice:', error);
        }
      }
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }
  
  /**
   * Sync single invoice with backend
   */
  static async syncWithBackend(invoiceData) {
    const response = await fetch('/api/invoices/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceData)
    });
    
    if (!response.ok) {
      throw new Error('Backend sync failed');
    }
    
    return response.json();
  }
  
  /**
   * Round helper
   */
  static round(value, decimals = 2) {
    return Math.round((value + Number.EPSILON) * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
  
  /**
   * Check if offline mode is available
   */
  static isOfflineReady() {
    return 'indexedDB' in window && 'serviceWorker' in navigator;
  }
}

// Auto-sync when coming online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('Back online - syncing pending invoices...');
    OfflineCalculator.syncPending();
  });
}

export default OfflineCalculator;