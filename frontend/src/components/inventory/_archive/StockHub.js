import React, { useState } from 'react';
import { 
  Package, ArrowDownToLine, ArrowUpFromLine, 
  BarChart3, AlertTriangle, X
} from 'lucide-react';
import StockMovementV2 from './StockMovementV2';
import { ModuleSidebar } from '../common';

const StockHub = ({ open = true, onClose }) => {
  const [activeModule, setActiveModule] = useState('stock-movement');

  if (!open) return null;

  const stockModules = [
    {
      id: 'stock-movement',
      label: 'Stock Movement',
      description: 'Receive/Issue stock',
      icon: Package,
      gradient: 'from-teal-500 to-teal-600'
    },
    {
      id: 'stock-adjustment',
      label: 'Stock Adjustment',
      description: 'Adjust inventory',
      icon: ArrowUpFromLine,
      gradient: 'from-amber-500 to-amber-600'
    },
    {
      id: 'stock-transfer',
      label: 'Stock Transfer',
      description: 'Transfer between locations',
      icon: ArrowDownToLine,
      gradient: 'from-blue-500 to-blue-600'
    },
    {
      id: 'stock-report',
      label: 'Stock Report',
      description: 'Inventory analysis',
      icon: BarChart3,
      gradient: 'from-purple-500 to-purple-600'
    },
    {
      id: 'low-stock',
      label: 'Low Stock Alert',
      description: 'Reorder management',
      icon: AlertTriangle,
      gradient: 'from-red-500 to-red-600'
    }
  ];

  // For now, all modules show the same component
  const renderModule = () => {
    return (
      <StockMovementV2 
        onClose={onClose}
        key={activeModule}
      />
    );
  };

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 flex">
      {/* Sidebar */}
      <ModuleSidebar 
        modules={stockModules}
        activeModule={activeModule}
        onModuleChange={setActiveModule}
      />
      
      {/* Main Content */}
      <div className="flex-1">
        {renderModule()}
      </div>
    </div>
  );
};

export default StockHub;