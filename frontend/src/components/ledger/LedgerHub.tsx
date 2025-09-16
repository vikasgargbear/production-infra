import React, { useState, useEffect } from 'react';
import {
  DollarSign, TrendingUp,
  AlertTriangle, FileText,
  Archive, Loader2, RefreshCw, AlertCircle
} from 'lucide-react';
import { ModuleHub } from '../global';
import PartyLedgerV3 from './PartyLedgerV3';
import Outstanding from './Outstanding';
import CollectionCenter from './CollectionCenter';

interface LedgerHubProps {
  open?: boolean;
  onClose?: () => void;
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

const LedgerHub: React.FC<LedgerHubProps> = ({ open = true, onClose }) => {
  // API data states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const ledgerModules: LedgerModule[] = [
    {
      id: 'party-statement',
      label: 'Ledger',
      fullLabel: 'Party Ledger',
      description: 'View transaction history',
      icon: FileText,
      color: 'blue',
      component: PartyLedgerV3
    },
    {
      id: 'outstanding',
      label: 'Outstanding',
      fullLabel: 'Outstanding & Aging',
      description: 'Pending payments with aging analysis',
      icon: DollarSign,
      color: 'amber',
      component: Outstanding
    },
    {
      id: 'collection-center',
      label: 'Collection',
      fullLabel: 'Collection Center',
      description: 'Payment follow-up',
      icon: AlertTriangle,
      color: 'orange',
      component: CollectionCenter
    }
  ];

  useEffect(() => {
    // Load initial data if needed
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Here you would load any initial ledger data
      // For now, we'll just set a default state
      
    } catch (error) {
      setError('Failed to load initial ledger data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
  };

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => {})}
      title="Party Ledger"
      subtitle="Manage customer & supplier accounts"
      icon={Archive}
      modules={ledgerModules}
      defaultModule="party-statement"
    />
  );
};

export default LedgerHub;