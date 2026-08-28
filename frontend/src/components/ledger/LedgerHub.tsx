import React, { useState } from 'react';
import {
  DollarSign,
  AlertTriangle, FileText,
  Archive
} from 'lucide-react';
import { ModuleHub } from '../global';
import PartyLedger from './PartyLedger';
import Outstanding from './Outstanding';
import CollectionCenter from './CollectionCenter';

export const LEDGER_SUBPAGE_IDS = [
  'party-statement',
  'outstanding',
  'collection-center',
] as const;
export type LedgerSubpage = typeof LEDGER_SUBPAGE_IDS[number];

interface LedgerHubProps {
  open?: boolean;
  onClose?: () => void;
  initialSubpage?: string | null;
  onSubpageChange?: (subpage: string | null) => void;
}

interface LedgerModule {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  component: React.ComponentType<any>;
}

const LedgerHub: React.FC<LedgerHubProps> = ({
  open = true,
  onClose,
  initialSubpage,
  onSubpageChange,
}) => {
  const resolvedDefault: LedgerSubpage = initialSubpage
    && (LEDGER_SUBPAGE_IDS as readonly string[]).includes(initialSubpage)
    ? initialSubpage as LedgerSubpage
    : 'party-statement';
  // Navigation state for switching between modules
  const [activeModule, setActiveModule] = useState<LedgerSubpage>(resolvedDefault);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  React.useEffect(() => {
    setActiveModule(resolvedDefault);
  }, [resolvedDefault]);

  const handleCustomerClick = (customer: any) => {
    // Store customer ID and switch to Outstanding module (shows invoice-level aging)
    setSelectedCustomerId(customer.customer_id);
    setActiveModule('outstanding');
    onSubpageChange?.('outstanding');
  };

  const ledgerModules: LedgerModule[] = [
    {
      id: 'party-statement',
      label: 'Ledger',
      fullLabel: 'Party Ledger',
      description: 'View transaction history',
      icon: FileText,
      color: 'blue',
      component: (props: any) => <PartyLedger {...props} />
    },
    {
      id: 'outstanding',
      label: 'Outstanding',
      fullLabel: 'Outstanding & Aging',
      description: 'Pending payments with aging analysis',
      icon: DollarSign,
      color: 'amber',
      component: (props: any) => (
        <Outstanding
          {...props}
          initialCustomerId={selectedCustomerId}
          onCustomerChange={() => setSelectedCustomerId(null)}
        />
      )
    },
    {
      id: 'collection-center',
      label: 'Collection',
      fullLabel: 'Collection Center',
      description: 'Payment follow-up',
      icon: AlertTriangle,
      color: 'orange',
      component: (props: any) => (
        <CollectionCenter
          {...props}
          onCustomerClick={handleCustomerClick}
        />
      )
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => { })}
      title="Ledger"
      subtitle="Manage customer & supplier accounts"
      icon={Archive}
      modules={ledgerModules}
      defaultModule={activeModule}
      onActiveModuleChange={onSubpageChange}
    />
  );
};

export default LedgerHub;
