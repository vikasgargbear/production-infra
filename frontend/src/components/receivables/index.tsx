// Receivables Module - Re-export from Ledger
// The main collection functionality is in the ledger module
export { default as CollectionCenter } from '../ledger/CollectionCenter';

/**
 * Receivables Module
 * 
 * The receivables functionality has been consolidated into the ledger module
 * for better integration with party ledgers and outstanding bills.
 * 
 * Main features available in ledger module:
 * - CollectionCenter - Comprehensive collection management
 * - OutstandingBills - Track and manage pending payments
 * - AgingAnalysis - Analyze payment aging patterns
 * - PartyBalance - View party-wise balances
 */

// Type definitions
export interface ReceivablesModule {
  CollectionCenter: React.ComponentType<any>;
}

// Constants
export const COLLECTION_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COLLECTED: 'collected',
  FAILED: 'failed',
  ESCALATED: 'escalated'
} as const;

export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;

export type CollectionStatus = typeof COLLECTION_STATUS[keyof typeof COLLECTION_STATUS];
export type RiskLevel = typeof RISK_LEVELS[keyof typeof RISK_LEVELS];

// Default export
export default {
  CollectionCenter,
  constants: {
    COLLECTION_STATUS,
    RISK_LEVELS
  }
};