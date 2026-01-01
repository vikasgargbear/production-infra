/**
 * Enterprise Document Number Generator
 * 
 * Generates consistent, sequential document numbers across all modules
 * Works offline and online with automatic sync
 * 
 * Format: PREFIX-YYYYMMDD-XXXX
 * Example: INV-20241027-0001, PO-20241027-0023, DC-20241027-0015
 */

import { apiClient, documentsApi } from '../../api';
import { IDBPDatabase, openDB } from 'idb';

// ==================== TYPE DEFINITIONS ====================

interface CounterRecord {
    key: string;
    value: number;
    type: string;
    date: string;
    updated_at: string;
}

type DocumentType =
    | 'INV'
    | 'PO'
    | 'DC'
    | 'PR'
    | 'SR'
    | 'PAY'
    | 'RCP'
    | 'QT'
    | 'PI'
    | 'GRN'
    | 'PUR'
    | 'SO'
    | 'SRN'
    | 'PRN'
    | 'CN'
    | 'DN'
    | 'ADJ'
    | 'TRF';

// ==================== CONSTANTS ====================

const DB_NAME = 'aaso_document_numbers';
const DB_VERSION = 1;
const COUNTERS_STORE = 'counters';

/** Document type prefixes */
export const DOC_TYPES: Record<string, DocumentType> = {
    INVOICE: 'INV',
    PURCHASE_ORDER: 'PO',
    DELIVERY_CHALLAN: 'DC',
    PURCHASE_RETURN: 'PR',
    SALES_RETURN: 'SR',
    PAYMENT: 'PAY',
    RECEIPT: 'RCP',
    QUOTATION: 'QT',
    PROFORMA: 'PI',
    GRN: 'GRN',
    PURCHASE: 'PUR',
    SALES_ORDER: 'SO',
    SALES_RETURN_NOTE: 'SRN',
    PURCHASE_RETURN_NOTE: 'PRN',
    CREDIT_NOTE: 'CN',
    DEBIT_NOTE: 'DN',
    ADJUSTMENT: 'ADJ',
    TRANSFER: 'TRF'
} as const;

// ==================== SERVICE CLASS ====================

class DocumentNumberGenerator {
    private db: IDBPDatabase | null = null;
    private counters: Map<string, number> = new Map();

    async initialize(): Promise<IDBPDatabase> {
        if (this.db) return this.db;

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
    async loadCounters(): Promise<void> {
        await this.initialize();
        const allCounters = await this.db!.getAll(COUNTERS_STORE) as CounterRecord[];

        for (const counter of allCounters) {
            this.counters.set(counter.key, counter.value);
        }
    }

    /**
     * Get today's date string (YYYYMMDD)
     */
    getTodayString(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    }

    /**
     * Generate next document number
     * 
     * @param docType - Document type from DOC_TYPES
     * @param tryBackend - Try to get number from backend first (default: true)
     * @returns Document number (e.g., "INV-20241027-0001")
     */
    async generateNumber(docType: DocumentType, tryBackend: boolean = true): Promise<string> {
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
                console.warn(`Backend number generation failed, using local: ${(error as Error).message}`);
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
    extractSequence(docNumber: string): number {
        const parts = docNumber.split('-');
        if (parts.length === 3) {
            return parseInt(parts[2], 10);
        }
        return 0;
    }

    /**
     * Get number from backend API
     */
    async getNumberFromBackend(docType: DocumentType): Promise<string | null> {
        try {
            // Use centralized API module
            const response = await documentsApi.generateNumber(docType);

            if (response.data?.number) {
                return response.data.number;
            }
        } catch (error: unknown) {
            const axiosError = error as { response?: { status: number } };
            if (axiosError.response?.status === 404) {
                console.warn(`[DocGen] Backend endpoint not available for ${docType}, using local generation`);
                return null;
            }
            console.warn(`[DocGen] Backend error for ${docType}:`, (error as Error).message);
            return null;
        }

        return null;
    }

    /**
     * Update counter in IndexedDB and memory
     */
    async updateCounter(key: string, value: number): Promise<void> {
        await this.initialize();

        const today = this.getTodayString();
        const [type] = key.split('_');

        const record: CounterRecord = {
            key,
            value,
            type,
            date: today,
            updated_at: new Date().toISOString()
        };

        await this.db!.put(COUNTERS_STORE, record);
        this.counters.set(key, value);
    }

    /**
     * Reserve a number (mark as used without incrementing)
     * Useful when backend provides a specific number to use
     */
    async reserveNumber(docNumber: string): Promise<void> {
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
    async getCurrentCounter(docType: DocumentType): Promise<number> {
        const today = this.getTodayString();
        const key = `${docType}_${today}`;
        return this.counters.get(key) || 0;
    }

    /**
     * Reset counter for today (use with caution!)
     */
    async resetTodayCounter(docType: DocumentType): Promise<void> {
        const today = this.getTodayString();
        const key = `${docType}_${today}`;
        await this.updateCounter(key, 0);
    }

    /**
     * Sync local counters with backend
     * Called when connection is restored
     */
    async syncWithBackend(): Promise<void> {
        if (!navigator.onLine) return;

        await this.initialize();

        for (const docType of Object.values(DOC_TYPES)) {
            try {
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
    async cleanOldCounters(): Promise<void> {
        await this.initialize();

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0].replace(/-/g, '');

        const allCounters = await this.db!.getAll(COUNTERS_STORE) as CounterRecord[];

        for (const counter of allCounters) {
            if (counter.date < cutoffDate) {
                await this.db!.delete(COUNTERS_STORE, counter.key);
                this.counters.delete(counter.key);
            }
        }
    }

    /**
     * Get all counters (for debugging)
     */
    async getAllCounters(): Promise<Array<{ key: string; value: number }>> {
        await this.initialize();
        return Array.from(this.counters.entries()).map(([key, value]) => ({ key, value }));
    }

    // ==================== CONVENIENCE METHODS ====================
    // These match documentNumberService API for easy migration

    /** Generate Invoice Number */
    async generateInvoiceNumber(): Promise<string> {
        return this.generateNumber('INV');
    }

    /** Generate Purchase Order Number */
    async generatePurchaseOrderNumber(): Promise<string> {
        return this.generateNumber('PO');
    }

    /** Alias for generatePurchaseOrderNumber */
    async generatePONumber(): Promise<string> {
        return this.generatePurchaseOrderNumber();
    }

    /** Generate GRN Number */
    async generateGRNNumber(): Promise<string> {
        return this.generateNumber('GRN');
    }

    /** Generate Purchase Number (direct purchase entry) */
    async generatePurchaseNumber(): Promise<string> {
        return this.generateNumber('PUR');
    }

    /** Generate Sales Order Number */
    async generateSalesOrderNumber(): Promise<string> {
        return this.generateNumber('SO');
    }

    /** Generate Delivery Challan Number */
    async generateChallanNumber(): Promise<string> {
        return this.generateNumber('DC');
    }

    /** Generate Sales Return Number */
    async generateSalesReturnNumber(): Promise<string> {
        return this.generateNumber('SRN');
    }

    /** Generate Return Number (alias for sales return) */
    async generateReturnNumber(): Promise<string> {
        return this.generateSalesReturnNumber();
    }

    /** Generate Purchase Return Number */
    async generatePurchaseReturnNumber(): Promise<string> {
        return this.generateNumber('PRN');
    }

    /** Generate Payment Number */
    async generatePaymentNumber(): Promise<string> {
        return this.generateNumber('PAY');
    }

    /** Generate Receipt Number */
    async generateReceiptNumber(): Promise<string> {
        return this.generateNumber('RCP');
    }

    /** Generate Credit Note Number */
    async generateCreditNoteNumber(): Promise<string> {
        return this.generateNumber('CN');
    }

    /** Generate Debit Note Number */
    async generateDebitNoteNumber(): Promise<string> {
        return this.generateNumber('DN');
    }

    /** Generate Stock Adjustment Number */
    async generateAdjustmentNumber(): Promise<string> {
        return this.generateNumber('ADJ');
    }

    /** Generate Stock Transfer Number */
    async generateTransferNumber(): Promise<string> {
        return this.generateNumber('TRF');
    }
}

// Singleton instance
const documentNumberGenerator = new DocumentNumberGenerator();

// Initialize on load
documentNumberGenerator.initialize().catch(console.error);

// Sync when online
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        documentNumberGenerator.syncWithBackend().catch(console.error);
    });

    // Clean old counters daily
    setInterval(() => {
        documentNumberGenerator.cleanOldCounters().catch(console.error);
    }, 24 * 60 * 60 * 1000);

    // Expose globally for debugging
    (window as any).documentNumberGenerator = documentNumberGenerator;
}

export default documentNumberGenerator;

// Re-export types
export type { DocumentType, CounterRecord };
