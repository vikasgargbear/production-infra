import React from 'react';
import {
  CreditCard, FileText, Calculator, Receipt,
  RefreshCw
} from 'lucide-react';
import { ModuleHub } from '../global';
import ModularPaymentEntry from './ModularPaymentEntry';
import FinancialJournalFlow from './FinancialJournalFlow';
import ExpenseClaimsFlow from './ExpenseClaimsFlow';
import BankReconciliationFlow from './BankReconciliationFlow';

interface FinancialHubProps {
  open?: boolean;
  onClose?: () => void;
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

const FinancialHub: React.FC<FinancialHubProps> = ({ open = true, onClose }) => {
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
      onClose={onClose || (() => {})}
      title="Financial Hub"
      subtitle="Payments, journals, and expense management"
      icon={Calculator}
      modules={financialModules}
      defaultModule="payment-entry"
    />
  );
};

export default FinancialHub;