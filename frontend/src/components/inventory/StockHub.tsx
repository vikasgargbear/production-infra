import React from 'react';
import {
  Package, ArrowDownToLine, ArrowUpFromLine,
  BarChart3, ArrowRightLeft, Archive, List
} from 'lucide-react';
import { ModuleHub } from '../global';
import type { ModuleItem } from '../global/navigation/ModuleHub.d';
import StockMovement from './stock/StockMovement';
import StockTransfer from './stock/StockTransfer';
import CurrentStock from './stock/CurrentStock';
import BatchTracking from './stock/BatchTracking';
import EnhancedStockAdjustmentFlow from './stock/StockAdjustmentFlow';

interface StockHubProps {
  open?: boolean;
  onClose?: () => void;
}


const StockHub: React.FC<StockHubProps> = ({ open = true, onClose }) => {
  const stockModules: ModuleItem[] = [
    {
      id: 'current-stock',
      label: 'Current Stock',
      fullLabel: 'Current Stock',
      description: 'View inventory levels',
      icon: Package,
      color: 'blue',
      component: CurrentStock
    },
    {
      id: 'stock-adjustment',
      label: 'Adjustment',
      fullLabel: 'Stock Adjustment',
      description: 'Adjust inventory',
      icon: ArrowUpFromLine,
      color: 'amber',
      component: EnhancedStockAdjustmentFlow
    },
    {
      id: 'batch-tracking',
      label: 'Batches',
      fullLabel: 'Batch Tracking',
      description: 'Track batch movements',
      icon: Package,
      color: 'green',
      component: BatchTracking
    },
    {
      id: 'stock-movement',
      label: 'Movements',
      fullLabel: 'Stock Movements',
      description: 'View all movement history',
      icon: List,
      color: 'teal',
      component: StockMovement
    },
    {
      id: 'stock-transfer',
      label: 'Transfer',
      fullLabel: 'Stock Transfer',
      description: 'Inter-branch transfers',
      icon: ArrowRightLeft,
      color: 'purple',
      component: StockTransfer
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => { })}
      title="Stock"
      subtitle="Manage inventory & warehouse"
      icon={Archive}
      modules={stockModules as any}  // ModuleHub.tsx lacks proper TS types
      defaultModule={"current-stock" as any}  // Type assertion needed
    />
  );

};

export default StockHub;