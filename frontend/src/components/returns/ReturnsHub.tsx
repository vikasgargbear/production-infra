import React from 'react';
import { RotateCcw, ShoppingCart, Package, List } from 'lucide-react';
import { ModuleHub } from '../global';
import SalesReturnFlow from './SalesReturnFlow';
import PurchaseReturnFlow from './PurchaseReturnFlow';
import ReturnsListHistory from './ReturnsListHistory';

interface ReturnsHubProps {
  open?: boolean;
  onClose?: () => void;
}

interface ReturnsModule {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  component: React.ComponentType<any>;
}

const ReturnsHub: React.FC<ReturnsHubProps> = ({ open = true, onClose }) => {
  const returnsModules: ReturnsModule[] = [
    {
      id: 'sales-return',
      label: 'Sales Return',
      fullLabel: 'Sales Return',
      description: 'Process customer returns',
      icon: ShoppingCart,
      color: 'red',
      component: SalesReturnFlow
    },
    {
      id: 'purchase-return',
      label: 'Purchase Return',
      fullLabel: 'Purchase Return',
      description: 'Return to suppliers',
      icon: Package,
      color: 'orange',
      component: PurchaseReturnFlow
    },
    {
      id: 'returns-history',
      label: 'All Returns',
      fullLabel: 'Returns History',
      description: 'View return history',
      icon: List,
      color: 'gray',
      component: ReturnsListHistory
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => { })}
      title="Returns"
      subtitle="Process sales and purchase returns"
      icon={RotateCcw}
      modules={returnsModules}
      defaultModule="sales-return"
    />
  );
};

export default ReturnsHub;