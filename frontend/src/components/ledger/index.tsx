/**
 * Party Ledger Module
 * Central export for all ledger-related components
 */

// Import components for default export
import LedgerHub from './LedgerHub';
import PartyStatement from './PartyStatement';
import PartyBalance from './PartyBalance';
import OutstandingBills from './OutstandingBills';
import AgingAnalysis from './AgingAnalysis';
import CollectionCenter from './CollectionCenter';
import LedgerReports from './LedgerReports';
import PartyLedger from './PartyLedger';
import PartyLedgerV2 from './PartyLedgerV2';
import PartyLedgerV3 from './PartyLedgerV3';

// Main Hub Component
export { default as LedgerHub } from './LedgerHub';

// Core Ledger Components
export { default as PartyStatement } from './PartyStatement';
export { default as PartyBalance } from './PartyBalance';
export { default as OutstandingBills } from './OutstandingBills';
export { default as AgingAnalysis } from './AgingAnalysis';
export { default as CollectionCenter } from './CollectionCenter';
export { default as LedgerReports } from './LedgerReports';

// Legacy Components (for backward compatibility)
export { default as PartyLedger } from './PartyLedger';
export { default as PartyLedgerV2 } from './PartyLedgerV2';
export { default as PartyLedgerV3 } from './PartyLedgerV3';

// Ledger Constants
export const TRANSACTION_TYPES = {
  INVOICE: 'invoice',
  PAYMENT: 'payment',
  CREDIT_NOTE: 'credit_note',
  DEBIT_NOTE: 'debit_note',
  OPENING_BALANCE: 'opening_balance',
  ADJUSTMENT: 'adjustment'
} as const;

export const AGING_BUCKETS = {
  CURRENT: { label: 'Current', days: 0 },
  '0_30': { label: '0-30 days', days: 30 },
  '31_60': { label: '31-60 days', days: 60 },
  '61_90': { label: '61-90 days', days: 90 },
  'OVER_90': { label: 'Over 90 days', days: 91 }
} as const;

export const PARTY_TYPES = {
  CUSTOMER: 'customer',
  SUPPLIER: 'supplier'
} as const;

// Type definitions
export type TransactionType = typeof TRANSACTION_TYPES[keyof typeof TRANSACTION_TYPES];
export type PartyType = typeof PARTY_TYPES[keyof typeof PARTY_TYPES];
export type AgingBucketKey = keyof typeof AGING_BUCKETS;

interface Transaction {
  type: 'debit' | 'credit';
  amount: number;
  date: string;
}

interface AgingBuckets {
  [key: string]: Transaction[];
}

// Ledger calculation utilities
export const calculateBalance = (transactions: Transaction[]): number => {
  return transactions.reduce((balance, transaction) => {
    if (transaction.type === 'debit') {
      return balance + transaction.amount;
    } else {
      return balance - transaction.amount;
    }
  }, 0);
};

export const groupByAgingBucket = (transactions: Transaction[], referenceDate: Date = new Date()): AgingBuckets => {
  const buckets: AgingBuckets = {};
  Object.keys(AGING_BUCKETS).forEach(key => {
    buckets[key] = [];
  });

  transactions.forEach(transaction => {
    const daysDiff = Math.floor((referenceDate.getTime() - new Date(transaction.date).getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 0) {
      buckets.CURRENT.push(transaction);
    } else if (daysDiff <= 30) {
      buckets['0_30'].push(transaction);
    } else if (daysDiff <= 60) {
      buckets['31_60'].push(transaction);
    } else if (daysDiff <= 90) {
      buckets['61_90'].push(transaction);
    } else {
      buckets.OVER_90.push(transaction);
    }
  });

  return buckets;
};

// API
export { ledgerApi } from '../../services/api/modules/ledger.api';

// Component interfaces
interface LedgerComponents {
  PartyStatement: React.ComponentType<any>;
  PartyBalance: React.ComponentType<any>;
  OutstandingBills: React.ComponentType<any>;
  AgingAnalysis: React.ComponentType<any>;
  CollectionCenter: React.ComponentType<any>;
  LedgerReports: React.ComponentType<any>;
  PartyLedger: React.ComponentType<any>;
  PartyLedgerV2: React.ComponentType<any>;
  PartyLedgerV3: React.ComponentType<any>;
}

interface LedgerConstants {
  TRANSACTION_TYPES: typeof TRANSACTION_TYPES;
  AGING_BUCKETS: typeof AGING_BUCKETS;
  PARTY_TYPES: typeof PARTY_TYPES;
}

interface LedgerUtils {
  calculateBalance: typeof calculateBalance;
  groupByAgingBucket: typeof groupByAgingBucket;
}

// Default export
interface LedgerModule {
  LedgerHub: React.ComponentType<any>;
  components: LedgerComponents;
  constants: LedgerConstants;
  utils: LedgerUtils;
}

const LedgerModule: LedgerModule = {
  // Main Hub
  LedgerHub,
  
  components: {
    // Core Components  
    PartyStatement,
    PartyBalance,
    OutstandingBills,
    AgingAnalysis,
    CollectionCenter,
    LedgerReports,
    
    // Legacy Components
    PartyLedger,
    PartyLedgerV2,
    PartyLedgerV3
  },
  
  constants: {
    TRANSACTION_TYPES,
    AGING_BUCKETS,
    PARTY_TYPES
  },
  
  utils: {
    calculateBalance,
    groupByAgingBucket
  }
};

export default LedgerModule;