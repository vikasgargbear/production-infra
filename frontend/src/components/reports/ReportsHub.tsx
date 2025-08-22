import React from 'react';
import { 
  BarChart3, TrendingUp, FileText, PieChart, 
  Calendar, DollarSign, Package, Users, 
  ShoppingCart, CreditCard, TrendingDown,
  Activity
} from 'lucide-react';
import { ModuleHub } from '../global';
import SalesReport from './SalesReport';
import PurchaseReport from './PurchaseReport';
import InventoryReport from './InventoryReport';
import FinancialReport from './FinancialReport';
import CustomerAnalytics from './CustomerAnalytics';
import ProductAnalytics from './ProductAnalytics';
import ProfitLossStatement from './ProfitLossStatement';
import ExecutiveDashboard from './ExecutiveDashboard';

interface ReportsHubProps {
  open?: boolean;
  onClose?: () => void;
}

interface ReportModule {
  id: string;
  label: string;
  fullLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  component: React.ComponentType<any>;
}

const ReportsHub: React.FC<ReportsHubProps> = ({ open = true, onClose }) => {
  const reportModules: ReportModule[] = [
    {
      id: 'executive-dashboard',
      label: 'Dashboard',
      fullLabel: 'Executive Dashboard',
      description: 'Key metrics overview',
      icon: Activity,
      color: 'slate',
      component: ExecutiveDashboard
    },
    {
      id: 'sales-report',
      label: 'Sales',
      fullLabel: 'Sales Report',
      description: 'Sales analysis & trends',
      icon: TrendingUp,
      color: 'blue',
      component: SalesReport
    },
    {
      id: 'purchase-report',
      label: 'Purchase',
      fullLabel: 'Purchase Report',
      description: 'Purchase analytics',
      icon: ShoppingCart,
      color: 'green',
      component: PurchaseReport
    },
    {
      id: 'inventory-report',
      label: 'Inventory',
      fullLabel: 'Inventory Report',
      description: 'Stock analysis',
      icon: Package,
      color: 'purple',
      component: InventoryReport
    },
    {
      id: 'financial-report',
      label: 'Financial',
      fullLabel: 'Financial Report',
      description: 'Revenue & expenses',
      icon: DollarSign,
      color: 'emerald',
      component: FinancialReport
    },
    {
      id: 'customer-analytics',
      label: 'Customers',
      fullLabel: 'Customer Analytics',
      description: 'Customer insights',
      icon: Users,
      color: 'indigo',
      component: CustomerAnalytics
    },
    {
      id: 'product-analytics',
      label: 'Products',
      fullLabel: 'Product Analytics',
      description: 'Product performance',
      icon: PieChart,
      color: 'amber',
      component: ProductAnalytics
    },
    {
      id: 'profit-loss',
      label: 'P&L',
      fullLabel: 'Profit & Loss Statement',
      description: 'Financial statement',
      icon: FileText,
      color: 'rose',
      component: ProfitLossStatement
    }
  ];

  return (
    <ModuleHub
      open={open}
      onClose={onClose || (() => {})}
      title="Reports & Analytics"
      subtitle="Business intelligence and insights"
      icon={BarChart3}
      modules={reportModules}
      defaultModule="executive-dashboard"
    />
  );
};

export default ReportsHub;