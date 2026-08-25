import React from 'react';
import {
  Package, ArrowDownToLine, ArrowUpFromLine,
  BarChart3, ArrowRightLeft, Archive, List, ShieldAlert
} from 'lucide-react';
import { ModuleHub } from '../global';
import type { ModuleItem } from '../global/navigation/ModuleHub.d';
import StockMovement from './stock/StockMovement';
import StockTransfer from './stock/StockTransfer';
import CurrentStock from './stock/CurrentStock';
import BatchTracking from './stock/BatchTracking';
import EnhancedStockAdjustmentFlow from './stock/StockAdjustmentFlow';
import InventoryDestructionFlow from './stock/InventoryDestructionFlow';

/**
 * Sub-module IDs used in the URL hash for deep-linking into StockHub.
 * e.g.  #/stock-management/batch-tracking
 */
export const STOCK_SUBPAGE_IDS = [
  'current-stock',
  'stock-adjustment',
  'batch-tracking',
  'stock-movement',
  'stock-transfer',
  'inventory-destruction',
] as const;
export type StockSubpage = typeof STOCK_SUBPAGE_IDS[number];

interface StockHubProps {
  open?: boolean;
  onClose?: () => void;
  /**
   * Deep-link sub-module to open on mount (e.g. "batch-tracking").
   * Comes from the URL hash (#/stock-management/<subpage>).
   */
  initialSubpage?: string | null;
  /**
   * Called when the user switches sub-modules inside the hub.
   * The parent (App) uses this to keep the URL hash in sync.
   */
  onSubpageChange?: (subpage: string | null) => void;
}


const StockHub: React.FC<StockHubProps> = ({
  open = true,
  onClose,
  initialSubpage,
  onSubpageChange,
}) => {
  /** Resolve the initial sub-module, falling back to current-stock. */
  const resolvedDefault: StockSubpage =
    initialSubpage && (STOCK_SUBPAGE_IDS as readonly string[]).includes(initialSubpage)
      ? (initialSubpage as StockSubpage)
      : 'current-stock';

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
    },
    {
      id: 'inventory-destruction',
      label: 'Destruction',
      fullLabel: 'Certified Destruction',
      description: 'Post witnessed stock destruction',
      icon: ShieldAlert,
      color: 'red',
      component: InventoryDestructionFlow
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
      defaultModule={resolvedDefault as any}  // Type assertion needed
      onActiveModuleChange={onSubpageChange}
    />
  );

};

export default StockHub;
