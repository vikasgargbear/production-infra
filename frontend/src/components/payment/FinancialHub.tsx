import React from 'react';
import { 
  CreditCard, FileText, TrendingUp, Calculator, Receipt, 
  Users, RefreshCw, Edit, BarChart3
} from 'lucide-react';
import { ModuleHub } from '../global';
import ModularPaymentEntry from './ModularPaymentEntry';
import FinancialJournalFlow from './FinancialJournalFlow';
import FinancialReportsSimple from './FinancialReportsSimple';
import ExpenseClaimsFlow from './ExpenseClaimsFlow';
import BankReconciliationFlow from './BankReconciliationFlow';
import OutstandingManagement from './OutstandingManagement';
import CreditDebitFlow from './CreditDebitFlow';
import GSTBalanced from '../gst/GSTBalanced';
import GSTFilingClean from '../gst/GSTFilingClean';
import GSTReports from '../gst/GSTReports';

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
    },
    {
      id: 'outstanding',
      label: 'Outstanding',
      fullLabel: 'Outstanding Management',
      description: 'Customer & supplier balances',
      icon: Users,
      color: 'amber',
      component: OutstandingManagement
    },
    {
      id: 'financial-reports',
      label: 'Reports',
      fullLabel: 'Financial Reports',
      description: 'View financial statements & reports',
      icon: TrendingUp,
      color: 'purple',
      component: FinancialReportsSimple
    },
    {
      id: 'credit-debit-notes',
      label: 'Credit/Debit Notes',
      fullLabel: 'Credit & Debit Notes',
      description: 'Create credit and debit notes',
      icon: Edit,
      color: 'indigo',
      component: CreditDebitFlow
    },
    {
      id: 'gst-overview',
      label: 'GST Overview',
      fullLabel: 'GST Dashboard',
      description: 'Tax summary & compliance status',
      icon: Calculator,
      color: 'blue',
      component: GSTBalanced
    },
    {
      id: 'gst-filing',
      label: 'GST Filing',
      fullLabel: 'GST Return Filing',
      description: 'File GST returns easily',
      icon: FileText,
      color: 'green',
      component: GSTFilingClean
    },
    {
      id: 'gst-reports',
      label: 'GST Reports',
      fullLabel: 'GST Reports & Analytics',
      description: 'GSTR-1, GSTR-3B and other reports',
      icon: BarChart3,
      color: 'cyan',
      component: GSTReports
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => {})}
      title="Financial Hub"
      subtitle="Payments, journals, and financial reports"
      icon={Calculator}
      modules={financialModules}
      defaultModule="payment-entry"
    />
  );
};

export default FinancialHub;