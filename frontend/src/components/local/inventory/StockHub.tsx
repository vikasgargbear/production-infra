import React from 'react';
import { 
  Package, ArrowDownToLine, ArrowUpFromLine, 
  BarChart3, AlertTriangle, ArrowRightLeft, Archive
} from 'lucide-react';
import { ModuleHub } from '../../global';
import StockMovement from '../../stock/StockMovement';
import StockTransfer from '../../stock/StockTransfer';
import CurrentStock from '../../stock/CurrentStock';
import BatchTracking from '../../stock/BatchTracking';
import StockAdjustment from '../../stock/StockAdjustment';
import StockReport from '../../stock/StockReport';
import LowStockAlert from '../../stock/LowStockAlert';

interface StockHubProps {
  open?: boolean;
  onClose?: () => void;
}

interface StockModule {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  component: React.ComponentType<any>;
}

const StockHub: React.FC<StockHubProps> = ({ open = true, onClose }) => {
  const stockModules: StockModule[] = [
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
      component: StockAdjustment
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
      label: 'Movement',
      fullLabel: 'Stock Movement',
      description: 'Receive/Issue stock',
      icon: ArrowDownToLine,
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
      id: 'low-stock',
      label: 'Alerts',
      fullLabel: 'Low Stock Alert',
      description: 'Reorder management',
      icon: AlertTriangle,
      color: 'red',
      component: LowStockAlert
    },
    {
      id: 'stock-report',
      label: 'Report',
      fullLabel: 'Stock Report',
      description: 'Inventory analysis',
      icon: BarChart3,
      color: 'purple',
      component: StockReport
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose}
      title="Stock Hub"
      subtitle="Manage inventory & warehouse"
      icon={Archive}
      modules={stockModules}
      defaultModule="current-stock"
    />
  );
};

export default StockHub;