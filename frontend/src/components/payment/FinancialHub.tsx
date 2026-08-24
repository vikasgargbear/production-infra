import React from 'react';
import {
  CreditCard, FileText, Calculator, Receipt,
  RefreshCw
} from 'lucide-react';
import { ModuleHub } from '../global';
import ModularPaymentEntry from './entry/ModularPaymentEntry';
import FinancialJournalFlow from './flows/FinancialJournalFlow';
import ExpenseClaimsFlow from './flows/ExpenseClaimsFlow';
import BankReconciliationFlow from './flows/BankReconciliationFlow';


interface FinancialHubProps {
  open?: boolean;
  onClose?: () => void;
  /**
   * Deep-link sub-module to open on mount (e.g. "journal-entry").
   * Comes from the URL hash (#/payment/<subpage>).
   */
  initialSubpage?: string | null;
  /**
   * Called when the user switches sub-modules inside the hub.
   * The parent (App) uses this to keep the URL hash in sync.
   */
  onSubpageChange?: (subpage: string | null) => void;
}

interface FinancialModule {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  component: React.ComponentType<any>;
}

const FinancialHub: React.FC<FinancialHubProps> = ({ open = true, onClose, initialSubpage, onSubpageChange }) => {
  /** All valid sub-module IDs for deep-linking into FinancialHub. */
  const PAYMENT_SUBPAGE_IDS = ['payment-entry', 'journal-entry', 'expense-claims', 'bank-reconciliation'] as const;

  const resolvedDefault =
    initialSubpage && PAYMENT_SUBPAGE_IDS.includes(initialSubpage as any)
      ? initialSubpage
      : 'payment-entry';

  const financialModules: FinancialModule[] = [
    {
      id: 'payment-entry',
      label: 'New Payment',
      fullLabel: 'Payment Entry',
      description: 'Record customer & supplier payments',
      icon: CreditCard,
      color: 'green',
      component: ModularPaymentEntry
    },
    {
      id: 'journal-entry',
      label: 'Journal Entry',
      fullLabel: 'Journal Voucher',
      description: 'Create accounting journal entries',
      icon: FileText,
      color: 'blue',
      component: FinancialJournalFlow
    },
    {
      id: 'expense-claims',
      label: 'Expenses',
      fullLabel: 'Expense Claims',
      description: 'Employee expense management',
      icon: Receipt,
      color: 'orange',
      component: ExpenseClaimsFlow
    },
    {
      id: 'bank-reconciliation',
      label: 'Bank Reconcile',
      fullLabel: 'Bank Reconciliation',
      description: 'Match bank statements',
      icon: RefreshCw,
      color: 'teal',
      component: BankReconciliationFlow
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => { })}
      title="Financial Hub"
      subtitle="Payments, journals, and expense management"
      icon={Calculator}
      modules={financialModules}
      defaultModule={resolvedDefault}
      onActiveModuleChange={onSubpageChange}
    />
  );
};

export default FinancialHub;