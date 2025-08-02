import React from 'react';
import { 
  User, Users, CreditCard, TrendingUp, 
  Clock, AlertTriangle, BarChart3, FileText,
  Archive
} from 'lucide-react';
import { ModuleHub } from '../global';
import PartyStatement from './PartyStatement';
import PartyLedgerV3 from './PartyLedgerV3';
import PartyBalance from './PartyBalance';
import OutstandingBills from './OutstandingBills';
import AgingAnalysis from './AgingAnalysis';
import CollectionCenter from './CollectionCenter';
import LedgerReports from './LedgerReports';

const LedgerHub = ({ open = true, onClose }) => {
  const ledgerModules = [
    {
      id: 'party-statement',
      label: 'Statement',
      fullLabel: 'Party Statement',
      description: 'View transaction history',
      icon: FileText,
      color: 'blue',
      component: PartyLedgerV3
    },
    {
      id: 'party-balance',
      label: 'Balances',
      fullLabel: 'Party Balances',
      description: 'Current outstanding amounts',
      icon: User,
      color: 'green',
      component: PartyBalance
    },
    {
      id: 'outstanding-bills',
      label: 'Outstanding',
      fullLabel: 'Outstanding Bills',
      description: 'Pending payments',
      icon: CreditCard,
      color: 'amber',
      component: OutstandingBills
    },
    {
      id: 'aging-analysis',
      label: 'Aging',
      fullLabel: 'Aging Analysis',
      description: 'Overdue analysis',
      icon: Clock,
      color: 'red',
      component: AgingAnalysis
    },
    {
      id: 'collection-center',
      label: 'Collection',
      fullLabel: 'Collection Center',
      description: 'Payment follow-up',
      icon: AlertTriangle,
      color: 'orange',
      component: CollectionCenter
    },
    {
      id: 'ledger-reports',
      label: 'Reports',
      fullLabel: 'Ledger Reports',
      description: 'Financial reports',
      icon: BarChart3,
      color: 'purple',
      component: LedgerReports
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose}
      title="Party Ledger"
      subtitle="Manage customer & supplier accounts"
      icon={Archive}
      modules={ledgerModules}
      defaultModule="party-statement"
    />
  );
};

export default LedgerHub;