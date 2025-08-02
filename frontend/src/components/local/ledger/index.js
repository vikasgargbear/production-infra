/**
 * Party Ledger Module
 * Central export for all ledger-related components
 */

// Import components for default export
import LedgerHub from './LedgerHub.tsx';
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
export { default as LedgerHub } from './LedgerHub.tsx';

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

// Ledger Utilities
export const TRANSACTION_TYPES = {
  INVOICE: 'invoice',
  PAYMENT: 'payment',
  CREDIT_NOTE: 'credit_note',
  DEBIT_NOTE: 'debit_note',
  OPENING_BALANCE: 'opening_balance',
  ADJUSTMENT: 'adjustment'
};

export const AGING_BUCKETS = {
  CURRENT: { label: 'Current', days: 0 },
  '0_30': { label: '0-30 days', days: 30 },
  '31_60': { label: '31-60 days', days: 60 },
  '61_90': { label: '61-90 days', days: 90 },
  'OVER_90': { label: 'Over 90 days', days: 91 }
};

export const PARTY_TYPES = {
  CUSTOMER: 'customer',
  SUPPLIER: 'supplier'
};

// Ledger calculation utilities
export const calculateBalance = (transactions) => {
  return transactions.reduce((balance, transaction) => {
    if (transaction.type === 'debit') {
      return balance + transaction.amount;
    } else {
      return balance - transaction.amount;
    }
  }, 0);
};

export const groupByAgingBucket = (transactions, referenceDate = new Date()) => {
  const buckets = {};
  Object.keys(AGING_BUCKETS).forEach(key => {
    buckets[key] = [];
  });

  transactions.forEach(transaction => {
    const daysDiff = Math.floor((referenceDate - new Date(transaction.date)) / (1000 * 60 * 60 * 24));
    
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

// Default export
const LedgerModule = {
  // Main Hub
  LedgerHub,
  
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
  PartyLedgerV3,
  
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