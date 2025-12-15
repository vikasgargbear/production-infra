/**
 * Enterprise Document Number Generator
 * 
 * Generates consistent, sequential document numbers across all modules
 * Works offline and online with automatic sync
 * 
 * Format: PREFIX-YYYYMMDD-XXXX
 * Example: INV-20241027-0001, PO-20241027-0023, DC-20241027-0015
 */

import { apiClient } from '../../api';

const DB_NAME = 'aaso_document_numbers';
const DB_VERSION = 1;
const COUNTERS_STORE = 'counters';

// Document type prefixes
export const DOC_TYPES = {
  INVOICE: 'INV',
  PURCHASE_ORDER: 'PO',
  DELIVERY_CHALLAN: 'DC',
  PURCHASE_RETURN: 'PR',
  SALES_RETURN: 'SR',
  PAYMENT: 'PAY',
  RECEIPT: 'RCP',
  QUOTATION: 'QT',
  PROFORMA: 'PI'
};

class DocumentNumberGenerator {
  constructor() {
    this.db = null;
    this.counters = new Map(); // In-memory cache for speed
  }

  async initialize() {
    if (this.db) return this.db;

    // Use IndexedDB for offline persistence
    const { openDB } = await import('idb');

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(COUNTERS_STORE)) {
          const store = db.createObjectStore(COUNTERS_STORE, { keyPath: 'key' });
          store.createIndex('date', 'date');
          store.createIndex('type', 'type');
        }
      }
    });

    // Load counters into memory
    await this.loadCounters();

    return this.db;
  }

  /**
   * Load all counters into memory for fast access
   */
  async loadCounters() {
    await this.initialize();
    const allCounters = await this.db.getAll(COUNTERS_STORE);

    for (const counter of allCounters) {
      this.counters.set(counter.key, counter.value);
    }
  }

  /**
   * Get today's date string (YYYYMMDD)
   */
  getTodayString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Generate next document number
   * 
   * @param {string} docType - Document type from DOC_TYPES
   * @param {boolean} tryBackend - Try to get number from backend first (default: true)
   * @returns {Promise<string>} Document number (e.g., "INV-20241027-0001")
   */
  async generateNumber(docType, tryBackend = true) {
    await this.initialize();

    const today = this.getTodayString();
    const key = `${docType}_${today}`;

    // Try backend first if online
    if (tryBackend && navigator.onLine) {
      try {
        const backendNumber = await this.getNumberFromBackend(docType);
        if (backendNumber) {
          // Update local counter to match backend
          await this.updateCounter(key, this.extractSequence(backendNumber));
          return backendNumber;
        }
      } catch (error) {
        console.warn(`Backend number generation failed, using local: ${error.message}`);
      }
    }

    // Get next local sequence
    let sequence = this.counters.get(key) || 0;
    sequence++;

    // Save to IndexedDB and memory
    await this.updateCounter(key, sequence);

    // Format: PREFIX-YYYYMMDD-XXXX
    const formattedSequence = String(sequence).padStart(4, '0');
    return `${docType}-${today}-${formattedSequence}`;
  }

  /**
   * Extract sequence number from document number
   * Example: "INV-20241027-0015" -> 15
   */
  extractSequence(docNumber) {
    const parts = docNumber.split('-');
    if (parts.length === 3) {
      return parseInt(parts[2], 10);
    }
    return 0;
  }

  /**
   * Get number from backend API
   */
  async getNumberFromBackend(docType) {
    try {
      // Use generic documents endpoint for all types
      const endpoint = `/documents/generate-number?type=${docType}`;

      const response = await apiClient.get(endpoint);

      if (response.data?.number) {
        return response.data.number;
      }
    } catch (error) {
      // If 404 or endpoint doesn't exist, return null to use local generation
      if (error.response?.status === 404) {
        console.warn(`[DocGen] Backend endpoint not available for ${docType}, using local generation`);
        return null;
      }
      // Don't throw - fallback to local generation
      console.warn(`[DocGen] Backend error for ${docType}:`, error.message);
      return null;
    }

    return null;
  }

  /**
   * Update counter in IndexedDB and memory
   */
  async updateCounter(key, value) {
    await this.initialize();

    const today = this.getTodayString();
    const [type] = key.split('_');

    await this.db.put(COUNTERS_STORE, {
      key,
      value,
      type,
      date: today,
      updated_at: new Date().toISOString()
    });

    this.counters.set(key, value);
  }

  /**
   * Reserve a number (mark as used without incrementing)
   * Useful when backend provides a specific number to use
   */
  async reserveNumber(docNumber) {
    await this.initialize();

    const parts = docNumber.split('-');
    if (parts.length !== 3) return;

    const [prefix, dateStr, seqStr] = parts;
    const key = `${prefix}_${dateStr}`;
    const sequence = parseInt(seqStr, 10);

    // Only update if this sequence is higher than current
    const current = this.counters.get(key) || 0;
    if (sequence > current) {
      await this.updateCounter(key, sequence);
    }
  }

  /**
   * Get current counter value (for debugging)
   */
  async getCurrentCounter(docType) {
    const today = this.getTodayString();
    const key = `${docType}_${today}`;
    return this.counters.get(key) || 0;
  }

  /**
   * Reset counter for today (use with caution!)
   */
  async resetTodayCounter(docType) {
    const today = this.getTodayString();
    const key = `${docType}_${today}`;
    await this.updateCounter(key, 0);
  }

  /**
   * Sync local counters with backend
   * Called when connection is restored
   */
  async syncWithBackend() {
    if (!navigator.onLine) return;

    await this.initialize();

    // Get all document types
    for (const docType of Object.values(DOC_TYPES)) {
      try {
        // Get latest number from backend
        const backendNumber = await this.getNumberFromBackend(docType);
        if (backendNumber) {
          await this.reserveNumber(backendNumber);
        }
      } catch (error) {
        // Continue with other types
      }
    }
  }

  /**
   * Clean old counters (older than 30 days)
   */
  async cleanOldCounters() {
    await this.initialize();

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0].replace(/-/g, '');

    const allCounters = await this.db.getAll(COUNTERS_STORE);

    for (const counter of allCounters) {
      if (counter.date < cutoffDate) {
        await this.db.delete(COUNTERS_STORE, counter.key);
        this.counters.delete(counter.key);
      }
    }
  }

  /**
   * Get all counters (for debugging)
   */
  async getAllCounters() {
    await this.initialize();
    return Array.from(this.counters.entries()).map(([key, value]) => ({ key, value }));
  }
}

// Singleton instance
const documentNumberGenerator = new DocumentNumberGenerator();

// Initialize on load
documentNumberGenerator.initialize().catch(console.error);

// Sync when online
window.addEventListener('online', () => {
  documentNumberGenerator.syncWithBackend().catch(console.error);
});

// Clean old counters daily
setInterval(() => {
  documentNumberGenerator.cleanOldCounters().catch(console.error);
}, 24 * 60 * 60 * 1000);

// Expose globally for debugging
if (typeof window !== 'undefined') {
  window.documentNumberGenerator = documentNumberGenerator;
}

export default documentNumberGenerator;
